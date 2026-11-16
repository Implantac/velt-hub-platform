/** Fenced publication attempts. A lost response never authorizes a second send. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import {
  publishToPlatform,
  preflightOrThrow,
  PublisherError,
  type PublishInput,
} from "./publishers.server";
import { getFreshToken } from "@/lib/oauth/refresh.server";
import {
  publicationTarget,
  validPublicationReference,
  type PublicationReference,
} from "./references";
import { runPublicationReconciliation } from "./reconciliation.server";

type Job = Database["public"]["Tables"]["scheduler_jobs"]["Row"];
export interface DispatchSummary {
  claimed: number;
  succeeded: number;
  failed: number;
  awaitingConfirmation: number;
  needsReview: number;
  jobs: Array<{
    id: string;
    status: "succeeded" | "failed" | "awaiting_confirmation" | "needs_review";
    externalPostId?: string;
    error?: string;
  }>;
}

/** Three 128 MiB uploads must not become twenty simultaneous in-memory downloads. */
export const MAX_PUBLICATIONS_PER_TICK = 3;

async function loadContext(job: Job) {
  const [{ data: content, error: contentError }, { data: channel, error: channelError }] =
    await Promise.all([
      supabaseAdmin
        .from("content")
        .select("id,workspace_id,title,body,media,type")
        .eq("id", job.content_id)
        .eq("workspace_id", job.workspace_id)
        .single(),
      supabaseAdmin
        .from("channels")
        .select("id,workspace_id,platform,metadata,external_id,status")
        .eq("id", job.channel_id)
        .eq("workspace_id", job.workspace_id)
        .single(),
    ]);
  if (contentError || !content)
    throw new PublisherError("Conteúdo não encontrado para a publicação.");
  if (channelError || !channel) throw new PublisherError("Canal não encontrado para a publicação.");
  if (content.workspace_id !== job.workspace_id || channel.workspace_id !== job.workspace_id)
    throw new PublisherError("content/channel workspace does not match the job");
  if (channel.status !== "connected")
    throw new PublisherError("channel is not connected; reconnect before publishing");
  return { content, channel };
}

function extractMediaUrls(media: unknown): string[] {
  if (!Array.isArray(media)) return [];
  return media
    .map((value) => (typeof value === "string" ? value : (value as { url?: string })?.url))
    .filter((url): url is string => typeof url === "string");
}

async function processOne(job: Job): Promise<DispatchSummary["jobs"][number]> {
  let reference: PublicationReference | undefined;
  let externalPostId: string | undefined;
  try {
    const { content, channel } = await loadContext(job);
    const config = {
      ...((channel.metadata as Record<string, unknown> | null) ?? {}),
      external_id: channel.external_id,
    };
    const target = publicationTarget(channel.platform, config);
    const input: PublishInput = {
      jobId: job.id,
      workspaceId: job.workspace_id,
      channelId: job.channel_id,
      contentId: job.content_id,
      platform: channel.platform,
      channelConfig: config,
      payload: {
        title: content.title,
        body: content.body,
        media_urls: extractMediaUrls(content.media),
      },
      beforeWrite: async () => {
        const { data: begun, error } = await supabaseAdmin.rpc("begin_publication_delivery", {
          _job_id: job.id,
          _delivery_token: job.delivery_token!,
          _platform: channel.platform,
          _target: target,
        });
        if (
          error ||
          !begun ||
          begun.id !== job.id ||
          begun.workspace_id !== job.workspace_id ||
          begun.delivery_token !== job.delivery_token ||
          begun.status !== "processing" ||
          begun.provider_target !== target ||
          begun.provider_platform !== channel.platform ||
          !begun.delivery_started_at
        )
          throw new PublisherError(
            "Não foi possível confirmar a reserva do envio. Nenhuma nova escrita no provedor foi iniciada.",
            { retryable: true },
          );
      },
      checkpoint: async (value) => {
        if (!validPublicationReference(channel.platform, target, value))
          throw new PublisherError("O provedor retornou uma referência inválida.");
        // Retain this in memory as a fallback even if the checkpoint acknowledgement is lost.
        reference = value;
        const { data: row, error } = await supabaseAdmin.rpc("checkpoint_publication_delivery", {
          _job_id: job.id,
          _delivery_token: job.delivery_token!,
          _kind: value.kind,
          _reference: value.id,
        });
        if (
          error ||
          !row ||
          row.id !== job.id ||
          row.workspace_id !== job.workspace_id ||
          row.provider_reference !== value.id ||
          row.provider_reference_kind !== value.kind
        )
          throw new Error("Checkpoint do envio não confirmado no banco.");
      },
    };
    preflightOrThrow(input);
    try {
      input.channelConfig.access_token = (
        await getFreshToken(job.channel_id, channel.platform)
      ).accessToken;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha na autorização do canal.";
      throw new PublisherError(`token refresh falhou: ${message}`, {
        retryable: !/sem token|reconect|revogad|invalid_grant/i.test(message),
      });
    }
    const result = await publishToPlatform(input);
    if (
      typeof result?.externalPostId !== "string" ||
      !result.externalPostId.trim() ||
      result.externalPostId.startsWith("sim_") ||
      !reference
    )
      throw new PublisherError(
        "Resposta sem post/checkpoint confirmado. Verifique o provedor antes de republicar.",
      );
    externalPostId = result.externalPostId;
    const { data: completed, error } = await supabaseAdmin.rpc("complete_publication_delivery", {
      _job_id: job.id,
      _delivery_token: job.delivery_token!,
      _external_post_id: externalPostId,
    });
    if (
      error ||
      !completed ||
      completed.id !== job.id ||
      completed.workspace_id !== job.workspace_id ||
      completed.status !== "succeeded" ||
      completed.external_post_id !== externalPostId ||
      completed.reconcile_state !== "confirmed"
    )
      throw new Error("Confirmação da publicação no banco não retornou o estado esperado.");
    return { id: job.id, status: "succeeded", externalPostId };
  } catch (error) {
    if (error instanceof PublisherError && error.reference) reference = error.reference;
    const message = error instanceof Error ? error.message : "Publicação sem confirmação final.";
    console.error(`[scheduler] job ${job.id}:`, message);
    const { data: recorded, error: recordError } = await supabaseAdmin.rpc(
      "fail_publication_delivery",
      {
        _job_id: job.id,
        _delivery_token: job.delivery_token!,
        _error: message.slice(0, 1000),
        _retryable: error instanceof PublisherError && error.retryable,
        _definite_rejection: error instanceof PublisherError && error.definiteRejection,
        _reference: reference?.id ?? null,
        _reference_kind: reference?.kind ?? null,
      },
    );
    if (
      recordError ||
      !recorded ||
      recorded.id !== job.id ||
      recorded.workspace_id !== job.workspace_id
    )
      throw new Error(
        "Não foi possível confirmar o estado da tentativa. A recuperação durável verificará a execução; não reenviar.",
      );
    if (
      externalPostId &&
      recorded.status === "succeeded" &&
      recorded.external_post_id === externalPostId &&
      recorded.reconcile_state === "confirmed"
    )
      return { id: job.id, status: "succeeded", externalPostId };
    if (recorded.status === "dead_letter" && recorded.reconcile_state === "pending")
      return { id: job.id, status: "awaiting_confirmation", error: message };
    if (recorded.status === "dead_letter" && recorded.reconcile_state === "review")
      return { id: job.id, status: "needs_review", error: message };
    if (
      ["pending", "dead_letter"].includes(recorded.status) &&
      ["none", "rejected", "closed"].includes(recorded.reconcile_state)
    )
      return { id: job.id, status: "failed", error: message };
    throw new Error("O registro da tentativa retornou um estado conflitante; não reenviar.");
  }
}

export async function runSchedulerTick(
  opts: { limit?: number; lockSeconds?: number; workspaceId?: string } = {},
): Promise<DispatchSummary> {
  const limit = opts.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new Error("Invalid publication batch limit");
  const { data: claimed, error } = await supabaseAdmin.rpc("claim_publication_jobs", {
    _limit: Math.min(limit, MAX_PUBLICATIONS_PER_TICK),
    _lock_seconds: opts.lockSeconds ?? 300,
    _workspace_id: opts.workspaceId ?? null,
  });
  if (error) throw new Error(`claim_publication_jobs: ${error.message}`);
  if (
    !Array.isArray(claimed) ||
    claimed.some((job) => !job || typeof job.id !== "string" || !job.delivery_token)
  )
    throw new Error("Scheduler claim did not return a confirmed fenced job set");
  const jobs = claimed as Job[];
  if (opts.workspaceId && jobs.some((job) => job.workspace_id !== opts.workspaceId))
    throw new Error("Scoped scheduler claim returned a different workspace; dispatch stopped");
  // Serialize jobs on one account to avoid concurrent refresh-token rotations in this batch.
  const priorByChannel = new Map<string, Promise<unknown>>();
  const outcomes = await Promise.allSettled(
    jobs.map((job) => {
      const task = (priorByChannel.get(job.channel_id) ?? Promise.resolve())
        .catch(() => {})
        .then(() => processOne(job));
      priorByChannel.set(job.channel_id, task);
      return task;
    }),
  );
  if (outcomes.some((outcome) => outcome.status === "rejected"))
    throw new Error(
      "Uma tentativa não teve o estado confirmado no banco. Consulte a fila; não repita envios sem confirmação.",
    );
  const results = outcomes.map(
    (outcome) => (outcome as PromiseFulfilledResult<DispatchSummary["jobs"][number]>).value,
  );
  return {
    claimed: jobs.length,
    succeeded: results.filter((job) => job.status === "succeeded").length,
    failed: results.filter((job) => job.status === "failed").length,
    awaitingConfirmation: results.filter((job) => job.status === "awaiting_confirmation").length,
    needsReview: results.filter((job) => job.status === "needs_review").length,
    jobs: results,
  };
}

/** Both native cron and the scoped owner/admin action recover/check before new sends. */
export async function runSchedulerCycle(
  opts: { limit?: number; lockSeconds?: number; workspaceId?: string } = {},
) {
  const reconciliation = await runPublicationReconciliation({
    workspaceId: opts.workspaceId,
    limit: 5,
  });
  const dispatch = await runSchedulerTick(opts);
  return { ...dispatch, reconciliation };
}
