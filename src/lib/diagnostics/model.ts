import { z } from "zod";
import {
  DIAGNOSTIC_LIMIT,
  DIAGNOSTIC_MODEL,
  diagnosticMetaSchema,
  diagnosticScoresSchema,
  diagnosticTimestamp,
  type DiagnosticComputeInput,
  type DiagnosticMessage,
  type HealthCategory,
} from "./contracts";

const scopedRow = z.object({ id: z.string().uuid(), workspace_id: z.string().uuid() });
export const brandEvidenceSchema = scopedRow.extend({
  voice: z.record(z.string(), z.json()).nullable(),
  palette: z.record(z.string(), z.json()).nullable(),
  logo_url: z.string().nullable(),
});
export const channelEvidenceSchema = scopedRow.extend({
  status: z.enum(["disconnected", "connected", "expired", "error"]),
  authorization_issue: z.string().nullable(),
  oauth_revoked_at: diagnosticTimestamp.nullable(),
});
export const contentEvidenceSchema = scopedRow.extend({ created_at: diagnosticTimestamp });
export const jobEvidenceSchema = scopedRow.extend({
  status: z.enum(["pending", "processing", "succeeded", "failed", "dead_letter", "cancelled"]),
  reconcile_state: z.enum(["none", "pending", "review", "confirmed", "closed"]),
  external_post_id: z.string().nullable(),
  scheduled_at: diagnosticTimestamp,
});
export type EvidenceResult = { data?: unknown; count?: number | null; error?: unknown };
export type DiagnosticEvidence = Record<"brands" | "channels" | "content" | "jobs", EvidenceResult>;

function source<T extends z.ZodType>(schema: T, result: EvidenceResult, workspaceId: string) {
  if (result.error !== null) throw new Error("A diagnostic source could not be read.");
  const rows = z.array(schema).max(DIAGNOSTIC_LIMIT).parse(result.data) as Array<
    z.infer<T> & { id: string; workspace_id: string }
  >;
  const total = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(result.count);
  if (
    rows.length !== Math.min(total, DIAGNOSTIC_LIMIT) ||
    new Set(rows.map((row) => row.id)).size !== rows.length ||
    rows.some((row) => row.workspace_id !== workspaceId)
  )
    throw new Error("Diagnostic source scope, exact count or complete slice was not confirmed.");
  return { rows, coverage: { loaded: rows.length, total, limit: DIAGNOSTIC_LIMIT } };
}
/** Non-empty keys alone (e.g. tone: "") do not constitute a configured identity. */
function meaningful(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(meaningful);
  if (value && typeof value === "object") return Object.values(value).some(meaningful);
  return false;
}

export const DIAGNOSTIC_FALLBACK_MESSAGES: Record<DiagnosticMessage, string> = {
  brandReady: "Identidade preenchida nas marcas analisadas.",
  brandMissing: "Cadastre uma marca para estruturar a presença digital.",
  brandIncomplete: "Complete voz, paleta e logo das marcas analisadas.",
  channelReady: "Os canais analisados estão registrados como conectados, sem bloqueio conhecido.",
  channelMissing: "Cadastre os canais da operação.",
  channelDisconnected: "Revise canais desconectados, expirados ou com bloqueio de autorização.",
  inventoryReady: "Há uma base de itens de conteúdo cadastrados.",
  inventoryLow: "Amplie a base de conteúdo; rascunhos também entram neste pilar.",
  recentActivity: "Há atividade de criação de itens nos últimos 30 dias.",
  activityLow: "Planeje a criação de conteúdo; este indicador não conta publicações confirmadas.",
  queueReady: "Há conclusões registradas com referência não simulada no recorte da fila.",
  queueFailures: "Revise as falhas definitivas no recorte da fila.",
  queueNoEvidence: "Sem base elegível na fila: zero na fórmula não significa falha medida.",
};

/**
 * Local, versioned heuristic. No shared Brain loader/AI/providers are called.
 * Every source must be available, counted and complete up to its explicit cap.
 * Counts belong to separate reads, not a transactionally consistent DB snapshot.
 */
export function calculateDiagnostics(
  evidence: DiagnosticEvidence,
  input: DiagnosticComputeInput,
  startedAt: string,
  finishedAt: string,
) {
  const brands = source(brandEvidenceSchema, evidence.brands, input.workspaceId);
  const channels = source(channelEvidenceSchema, evidence.channels, input.workspaceId);
  const content = source(contentEvidenceSchema, evidence.content, input.workspaceId);
  const jobs = source(jobEvidenceSchema, evidence.jobs, input.workspaceId);
  const now = Date.parse(diagnosticTimestamp.parse(startedAt));
  const recentCreated = content.rows.filter((row) => {
    const time = Date.parse(row.created_at);
    return time >= now - 30 * 86_400_000 && time <= now;
  }).length;
  const connected = channels.rows.filter(
    (row) =>
      row.status === "connected" && !row.authorization_issue && row.oauth_revoked_at === null,
  ).length;
  let successes = 0;
  let failures = 0;
  for (const row of jobs.rows) {
    const reference = row.external_post_id?.trim() ?? "";
    if (
      Date.parse(row.scheduled_at) > now ||
      reference.toLowerCase().startsWith("sim_") ||
      row.reconcile_state === "pending" ||
      row.reconcile_state === "review" ||
      row.reconcile_state === "closed"
    )
      continue;
    if (
      row.status === "succeeded" &&
      reference.length > 0 &&
      (row.reconcile_state === "none" || row.reconcile_state === "confirmed")
    )
      successes++;
    else if (
      (row.status === "failed" || row.status === "dead_letter") &&
      row.reconcile_state === "none" &&
      reference.length === 0
    )
      failures++;
  }
  const scores = diagnosticScoresSchema.parse({
    overall: 0,
    presence: Math.round(
      Math.min(brands.rows.length, 1) * 40 + (Math.min(channels.rows.length, 3) / 3) * 60,
    ),
    branding: brands.rows.length
      ? Math.round(
          brands.rows.reduce(
            (sum, row) =>
              sum +
              (meaningful(row.voice) ? 35 : 0) +
              (meaningful(row.palette) ? 35 : 0) +
              (row.logo_url?.trim() ? 30 : 0),
            0,
          ) / brands.rows.length,
        )
      : 0,
    content: Math.min(100, content.rows.length * 8),
    consistency: Math.min(100, recentCreated * 12),
    growth: successes + failures ? Math.round((successes / (successes + failures)) * 100) : 0,
    channel_setup: channels.rows.length ? Math.round((connected / channels.rows.length) * 100) : 0,
  });
  scores.overall = Math.round(
    scores.presence * 0.18 +
      scores.branding * 0.17 +
      scores.content * 0.2 +
      scores.consistency * 0.18 +
      scores.growth * 0.14 +
      scores.channel_setup * 0.13,
  );
  const diagnostic = diagnosticMetaSchema.parse({
    model: DIAGNOSTIC_MODEL,
    calculationId: input.calculationId,
    startedAt,
    finishedAt,
    sources: {
      brands: brands.coverage,
      channels: channels.coverage,
      content: content.coverage,
      jobs: jobs.coverage,
    },
    recentCreated,
    jobEvidence: { successes, failures, excluded: jobs.rows.length - successes - failures },
  });
  const brandWeak: DiagnosticMessage[] =
    brands.rows.length === 0 ? ["brandMissing"] : scores.branding < 70 ? ["brandIncomplete"] : [];
  const channelWeak: DiagnosticMessage[] =
    channels.rows.length === 0
      ? ["channelMissing"]
      : connected < channels.rows.length
        ? ["channelDisconnected"]
        : [];
  const inventoryWeak: DiagnosticMessage[] = scores.content < 70 ? ["inventoryLow"] : [];
  const activityWeak: DiagnosticMessage[] = scores.consistency < 70 ? ["activityLow"] : [];
  const queueWeak: DiagnosticMessage[] =
    successes + failures === 0 ? ["queueNoEvidence"] : failures > 0 ? ["queueFailures"] : [];
  const gapCodes = [...brandWeak, ...channelWeak, ...inventoryWeak, ...activityWeak, ...queueWeak];
  const cards: Array<{
    category: HealthCategory;
    score: number;
    strengthCodes: DiagnosticMessage[];
    weaknessCodes: DiagnosticMessage[];
  }> = [
    {
      category: "marketing",
      score: Math.round((scores.presence + scores.channel_setup) / 2),
      strengthCodes: connected > 0 && !channelWeak.length ? ["channelReady"] : [],
      weaknessCodes: [...brandWeak, ...channelWeak],
    },
    {
      category: "content",
      score: Math.round((scores.content + scores.consistency) / 2),
      strengthCodes: [
        ...(scores.content >= 70 ? ["inventoryReady" as const] : []),
        ...(scores.consistency >= 70 ? ["recentActivity" as const] : []),
      ],
      weaknessCodes: [...inventoryWeak, ...activityWeak],
    },
    {
      category: "brand",
      score: scores.branding,
      strengthCodes: scores.branding >= 70 ? ["brandReady"] : [],
      weaknessCodes: brandWeak,
    },
    {
      category: "channel",
      score: scores.channel_setup,
      strengthCodes: channels.rows.length > 0 && !channelWeak.length ? ["channelReady"] : [],
      weaknessCodes: channelWeak,
    },
    {
      category: "growth",
      score: scores.growth,
      strengthCodes: successes > 0 ? ["queueReady"] : [],
      weaknessCodes: queueWeak,
    },
  ];
  return { scores, diagnostic, gapCodes, cards };
}
