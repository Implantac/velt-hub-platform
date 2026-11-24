import { z } from "zod";

export const DIAGNOSTIC_MODEL = "velt-records-v2" as const;
export const DIAGNOSTIC_LIMIT = 500;
export const DIAGNOSTIC_READ_ROLES = ["owner", "admin", "editor", "viewer"] as const;
export const HEALTH_CATEGORIES = ["marketing", "content", "brand", "channel", "growth"] as const;
export const SCORE_PILLARS = [
  "presence",
  "branding",
  "content",
  "consistency",
  "growth",
  "channel_setup",
] as const;
export const DIAGNOSTIC_MESSAGES = [
  "brandReady",
  "brandMissing",
  "brandIncomplete",
  "channelReady",
  "channelMissing",
  "channelDisconnected",
  "inventoryReady",
  "inventoryLow",
  "recentActivity",
  "activityLow",
  "queueReady",
  "queueFailures",
  "queueNoEvidence",
] as const;
export type DiagnosticKind = "health" | "score";
export type HealthCategory = (typeof HEALTH_CATEGORIES)[number];
export type DiagnosticMessage = (typeof DIAGNOSTIC_MESSAGES)[number];
const uuid = z.string().uuid();
export const diagnosticTimestamp = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)));
export const diagnosticScore = z.number().int().min(0).max(100);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const diagnosticScopeSchema = z.object({ workspaceId: uuid });
export const diagnosticComputeSchema = diagnosticScopeSchema.extend({ calculationId: uuid });
export const diagnosticScoresSchema = z.object({
  overall: diagnosticScore,
  presence: diagnosticScore,
  branding: diagnosticScore,
  content: diagnosticScore,
  consistency: diagnosticScore,
  growth: diagnosticScore,
  channel_setup: diagnosticScore,
});
const sourceSchema = z
  .object({ loaded: count.max(DIAGNOSTIC_LIMIT), total: count, limit: z.literal(DIAGNOSTIC_LIMIT) })
  .refine(
    (source) => source.loaded === Math.min(source.total, source.limit),
    "Incomplete source slice.",
  );
export const diagnosticMetaSchema = z
  .object({
    model: z.literal(DIAGNOSTIC_MODEL),
    calculationId: uuid,
    startedAt: diagnosticTimestamp,
    finishedAt: diagnosticTimestamp,
    sources: z.object({
      brands: sourceSchema,
      channels: sourceSchema,
      content: sourceSchema,
      jobs: sourceSchema,
    }),
    recentCreated: count,
    jobEvidence: z.object({ successes: count, failures: count, excluded: count }),
  })
  .refine(
    (meta) =>
      Date.parse(meta.finishedAt) >= Date.parse(meta.startedAt) &&
      meta.recentCreated <= meta.sources.content.loaded &&
      meta.jobEvidence.successes + meta.jobEvidence.failures + meta.jobEvidence.excluded ===
        meta.sources.jobs.loaded,
    "Diagnostic metadata does not match the loaded evidence.",
  );
const codes = z
  .array(z.enum(DIAGNOSTIC_MESSAGES))
  .max(DIAGNOSTIC_MESSAGES.length)
  .refine((items) => new Set(items).size === items.length);
const scoreDetails = z.object({
  diagnostic: diagnosticMetaSchema,
  gapCodes: codes,
  gaps: z.array(z.string()),
});
const healthDetails = z.object({
  diagnostic: diagnosticMetaSchema,
  strengthCodes: codes,
  weaknessCodes: codes,
});

export const scoreRecordSchema = diagnosticScoresSchema.extend({
  id: uuid,
  workspace_id: uuid,
  computed_at: diagnosticTimestamp,
  breakdown: z.json(),
});
export const healthRecordSchema = z.object({
  id: uuid,
  workspace_id: uuid,
  computed_at: diagnosticTimestamp,
  category: z.enum(HEALTH_CATEGORIES),
  score: diagnosticScore,
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  details: z.json(),
});
export type DiagnosticMeta = z.infer<typeof diagnosticMetaSchema>;
export type DiagnosticScores = z.infer<typeof diagnosticScoresSchema>;
export type ScoreRecord = z.infer<typeof scoreRecordSchema>;
export type HealthRecord = z.infer<typeof healthRecordSchema>;
export type DiagnosticComputeInput = z.infer<typeof diagnosticComputeSchema>;

function hasDiagnostic(value: unknown): boolean {
  return typeof value === "object" && value !== null && "diagnostic" in value;
}
/** Legacy JSON is preserved, not silently promoted to a verified v2 methodology. */
export function scoreMethod(row: ScoreRecord) {
  return hasDiagnostic(row.breakdown) ? scoreDetails.parse(row.breakdown) : null;
}
export function healthMethod(row: HealthRecord) {
  return hasDiagnostic(row.details) ? healthDetails.parse(row.details) : null;
}
function confirmTime(computedAt: string, meta: DiagnosticMeta | undefined) {
  if (meta && Date.parse(computedAt) !== Date.parse(meta.finishedAt))
    throw new Error("The saved diagnostic timestamp does not match its methodology.");
}
export function confirmScore(value: unknown, workspaceId: string): ScoreRecord {
  const row = scoreRecordSchema.parse(value);
  if (row.workspace_id !== workspaceId) throw new Error("Score workspace was not confirmed.");
  const method = scoreMethod(row);
  if (method && row.id !== method.diagnostic.calculationId)
    throw new Error("The saved score calculation was not confirmed.");
  confirmTime(row.computed_at, method?.diagnostic);
  if (method) {
    const meta = method.diagnostic;
    const terminal = meta.jobEvidence.successes + meta.jobEvidence.failures;
    const expectedOverall = Math.round(
      row.presence * 0.18 +
        row.branding * 0.17 +
        row.content * 0.2 +
        row.consistency * 0.18 +
        row.growth * 0.14 +
        row.channel_setup * 0.13,
    );
    if (
      row.presence !==
        Math.round(
          Math.min(meta.sources.brands.loaded, 1) * 40 +
            Math.min(meta.sources.channels.loaded, 3) * 20,
        ) ||
      row.content !== Math.min(100, meta.sources.content.loaded * 8) ||
      row.consistency !== Math.min(100, meta.recentCreated * 12) ||
      row.growth !== (terminal ? Math.round((meta.jobEvidence.successes / terminal) * 100) : 0) ||
      row.overall !== expectedOverall ||
      (meta.sources.brands.loaded === 0 && row.branding !== 0) ||
      (meta.sources.channels.loaded === 0 && row.channel_setup !== 0)
    )
      throw new Error("Saved score pillars do not match the recorded methodology.");
  }
  return row;
}
export function confirmHealth(value: unknown, workspaceId: string): HealthRecord[] {
  const rows = z.array(healthRecordSchema).max(HEALTH_CATEGORIES.length).parse(value);
  if (
    rows.some((row) => row.workspace_id !== workspaceId) ||
    new Set(rows.map((row) => row.id)).size !== rows.length ||
    new Set(rows.map((row) => row.category)).size !== rows.length
  )
    throw new Error("Health categories, IDs or workspace were not confirmed.");
  rows.forEach((row) => confirmTime(row.computed_at, healthMethod(row)?.diagnostic));
  return HEALTH_CATEGORIES.flatMap((category) => rows.filter((row) => row.category === category));
}
export function confirmSavedScore(value: unknown, expected: ScoreRecord): ScoreRecord {
  const row = confirmScore(value, expected.workspace_id);
  if (
    row.id !== expected.id ||
    Date.parse(row.computed_at) !== Date.parse(expected.computed_at) ||
    Object.keys(diagnosticScoresSchema.shape).some(
      (key) => row[key as keyof DiagnosticScores] !== expected[key as keyof DiagnosticScores],
    ) ||
    JSON.stringify(scoreMethod(row)) !== JSON.stringify(scoreMethod(expected))
  )
    throw new Error("The inserted score was not confirmed.");
  return row;
}
export function confirmSavedHealth(value: unknown, expected: HealthRecord[]): HealthRecord[] {
  if (expected.length !== HEALTH_CATEGORIES.length)
    throw new Error("Five health areas are required.");
  const rows = confirmHealth(value, expected[0].workspace_id);
  if (
    rows.length !== expected.length ||
    expected.some((item) => {
      const row = rows.find((candidate) => candidate.id === item.id);
      return (
        !row ||
        row.category !== item.category ||
        row.score !== item.score ||
        Date.parse(row.computed_at) !== Date.parse(item.computed_at) ||
        JSON.stringify(row.strengths) !== JSON.stringify(item.strengths) ||
        JSON.stringify(row.weaknesses) !== JSON.stringify(item.weaknesses) ||
        JSON.stringify(healthMethod(row)) !== JSON.stringify(healthMethod(item))
      );
    })
  )
    throw new Error("The five inserted health areas were not confirmed.");
  return rows;
}
export const scoreReceiptSchema = z.object({
  score: scoreRecordSchema,
  snapshotRecorded: z.boolean(),
  answersInvalidated: z.boolean(),
});
export const healthReceiptSchema = z.object({ metrics: z.array(healthRecordSchema) });
export function confirmScoreReceipt(value: unknown, input: DiagnosticComputeInput) {
  const receipt = scoreReceiptSchema.parse(value);
  const score = confirmScore(receipt.score, input.workspaceId);
  if (
    score.id !== input.calculationId ||
    scoreMethod(score)?.diagnostic.calculationId !== input.calculationId ||
    (!receipt.snapshotRecorded && receipt.answersInvalidated)
  )
    throw new Error("The score calculation receipt was not confirmed.");
  return { ...receipt, score };
}
export function confirmHealthReceipt(value: unknown, input: DiagnosticComputeInput) {
  const receipt = healthReceiptSchema.parse(value);
  const metrics = confirmHealth(receipt.metrics, input.workspaceId);
  if (
    metrics.length !== HEALTH_CATEGORIES.length ||
    metrics.some((row) => healthMethod(row)?.diagnostic.calculationId !== input.calculationId) ||
    new Set(metrics.map((row) => Date.parse(row.computed_at))).size !== 1 ||
    new Set(metrics.map((row) => JSON.stringify(healthMethod(row)?.diagnostic))).size !== 1
  )
    throw new Error("The health calculation receipt was not confirmed.");
  return { metrics };
}

export type DiagnosticData =
  { kind: "score"; value: ScoreRecord | null } | { kind: "health"; value: HealthRecord[] };
export function confirmDiagnosticRead(
  kind: DiagnosticKind,
  value: unknown,
  workspaceId: string,
): DiagnosticData {
  return kind === "score"
    ? { kind, value: value === null ? null : confirmScore(value, workspaceId) }
    : { kind, value: confirmHealth(value, workspaceId) };
}
