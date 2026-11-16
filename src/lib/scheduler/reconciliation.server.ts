/** Durable recovery and read-only checks, never a second publish/upload. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { OAuthCredentialError } from "@/lib/oauth/errors.server";
import { getFreshToken } from "@/lib/oauth/refresh.server";
import { observePublication, type PublicationObservation } from "./observe.server";
import {
  publicationTarget,
  validPublicationReference,
  type PublicationReference,
} from "./references";

type Job = Database["public"]["Tables"]["scheduler_jobs"]["Row"];
export interface ReconciliationSummary {
  recovered: number;
  safelyRequeued: number;
  checked: number;
  providerQueries: number;
  confirmed: number;
  pending: number;
  review: number;
  rejected: number;
  jobs: Array<{ id: string; state: string; queriedProvider: boolean }>;
}

function confirmedRows(value: unknown, workspaceId?: string, jobId?: string): Job[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (row) =>
        !row ||
        typeof row.id !== "string" ||
        (workspaceId && row.workspace_id !== workspaceId) ||
        (jobId && row.id !== jobId),
    )
  )
    throw new Error(
      "A recuperação retornou um conjunto não confirmado ou fora do workspace solicitado.",
    );
  return value as Job[];
}

async function inspect(
  job: Job,
): Promise<{ outcome: PublicationObservation; queriedProvider: boolean }> {
  const noQuery = (note: string) => ({
    outcome: { state: "review" as const, note },
    queriedProvider: false,
  });
  if (
    !job.provider_reference ||
    !job.provider_reference_kind ||
    !job.provider_platform ||
    !job.provider_target
  )
    return noQuery(
      "Falta uma referência/conta segura para consultar. Revise o provedor antes de qualquer novo envio.",
    );
  const reference = {
    kind: job.provider_reference_kind,
    id: job.provider_reference,
  } as PublicationReference;
  if (!validPublicationReference(job.provider_platform, job.provider_target, reference))
    return noQuery("A referência preservada não pode ser consultada com segurança.");
  if (reference.kind === "facebook_photo")
    return noQuery(
      "Um ID de foto não confirma o post da Página. Revise a referência no provedor sem reenviar.",
    );
  const { data: channel, error } = await supabaseAdmin
    .from("channels")
    .select("id,workspace_id,platform,external_id,metadata,status")
    .eq("id", job.channel_id)
    .eq("workspace_id", job.workspace_id)
    .maybeSingle();
  if (error) throw new Error("Não foi possível ler o canal para verificar a publicação.");
  if (
    !channel ||
    channel.workspace_id !== job.workspace_id ||
    channel.platform !== job.provider_platform ||
    channel.status !== "connected"
  )
    return noQuery(
      "O canal não está conectado à mesma conta/workspace. Reconecte antes de consultar; não reenviar.",
    );
  try {
    const currentTarget = publicationTarget(channel.platform, {
      ...((channel.metadata as Record<string, unknown> | null) ?? {}),
      external_id: channel.external_id,
    });
    if (currentTarget !== job.provider_target)
      return noQuery("A identidade atual do canal não corresponde à conta preservada no envio.");
  } catch {
    return noQuery("A conta do canal não pode ser validada com segurança para esta referência.");
  }
  let accessToken: string;
  try {
    accessToken = (await getFreshToken(channel.id, channel.platform)).accessToken;
  } catch (error) {
    if (error instanceof OAuthCredentialError && error.retryable)
      return {
        outcome: {
          state: "pending",
          note: "A autorização de leitura está temporariamente indisponível. A consulta será retomada sem reenviar a publicação.",
        },
        queriedProvider: false,
      };
    return noQuery(
      "Não foi possível obter autorização de leitura. Reconecte a mesma conta antes de verificar; não reenviar.",
    );
  }
  return {
    outcome: await observePublication({
      platform: job.provider_platform,
      target: job.provider_target,
      reference,
      accessToken,
    }),
    queriedProvider: true,
  };
}

export async function runPublicationReconciliation(
  opts: { workspaceId?: string; jobId?: string; limit?: number } = {},
): Promise<ReconciliationSummary> {
  if (opts.jobId && !opts.workspaceId)
    throw new Error("Uma verificação individual exige workspace explícito.");
  const limit = opts.jobId ? 1 : (opts.limit ?? 5);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new Error("Limite inválido de consultas de confirmação.");
  const started = Date.now();
  const { data: recoveredData, error: recoveryError } = await supabaseAdmin.rpc(
    "recover_publication_deliveries",
    {
      _workspace_id: opts.workspaceId ?? null,
      _job_id: opts.jobId ?? null,
      _limit: 50,
    },
  );
  if (recoveryError) throw new Error("Não foi possível confirmar a recuperação da fila.");
  const recovered = confirmedRows(recoveredData, opts.workspaceId, opts.jobId);
  const jobs: ReconciliationSummary["jobs"] = [];
  // Reserve just before each read. Reserving five 60-second leases at once and
  // reading sequentially would let later leases expire before their turn.
  for (let i = 0; i < limit; i++) {
    if (i > 0 && Date.now() - started >= 45_000) break;
    const { data: claimedData, error: claimError } = await supabaseAdmin.rpc(
      "claim_publication_reconciliations",
      {
        _workspace_id: opts.workspaceId ?? null,
        _job_id: opts.jobId ?? null,
        _limit: 1,
        _lock_seconds: 60,
      },
    );
    if (claimError) throw new Error("Não foi possível reservar as consultas de confirmação.");
    const claimed = confirmedRows(claimedData, opts.workspaceId, opts.jobId);
    if (
      claimed.length > 1 ||
      claimed.some(
        (job) =>
          !job.reconcile_token ||
          job.status !== "dead_letter" ||
          !["pending", "review"].includes(job.reconcile_state),
      )
    )
      throw new Error("Consulta de confirmação sem lease único válido.");
    if (!claimed.length) break;
    const job = claimed[0];
    const { outcome, queriedProvider } = await inspect(job);
    const { data: recorded, error } = await supabaseAdmin.rpc("settle_publication_reconciliation", {
      _job_id: job.id,
      _reconcile_token: job.reconcile_token!,
      _state: outcome.state,
      _external_post_id: outcome.state === "confirmed" ? outcome.externalPostId : null,
      _note: outcome.note,
    });
    if (
      error ||
      !recorded ||
      recorded.id !== job.id ||
      recorded.workspace_id !== job.workspace_id ||
      (outcome.state === "confirmed" &&
        (recorded.status !== "succeeded" ||
          recorded.reconcile_state !== "confirmed" ||
          recorded.external_post_id !== outcome.externalPostId)) ||
      (outcome.state !== "confirmed" &&
        (recorded.status !== "dead_letter" ||
          ![outcome.state, ...(outcome.state === "pending" ? ["review"] : [])].includes(
            recorded.reconcile_state,
          )))
    )
      throw new Error(
        "A consulta não teve o resultado confirmado no banco. Aguarde a próxima verificação; não reenviar.",
      );
    jobs.push({ id: job.id, state: recorded.reconcile_state, queriedProvider });
  }
  const checkedIds = new Set(jobs.map((job) => job.id));
  const reviewsRecovered = recovered.filter(
    (job) => job.reconcile_state === "review" && !checkedIds.has(job.id),
  ).length;
  return {
    recovered: recovered.length,
    safelyRequeued: recovered.filter((job) => job.status === "pending").length,
    checked: jobs.length,
    providerQueries: jobs.filter((job) => job.queriedProvider).length,
    confirmed: jobs.filter((job) => job.state === "confirmed").length,
    pending:
      jobs.filter((job) => job.state === "pending").length +
      recovered.filter((job) => job.reconcile_state === "pending" && !checkedIds.has(job.id))
        .length,
    review: jobs.filter((job) => job.state === "review").length + reviewsRecovered,
    rejected: jobs.filter((job) => job.state === "rejected").length,
    jobs,
  };
}
