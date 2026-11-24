import { z } from "zod";
import { diagnosticMetaSchema, diagnosticTimestamp } from "@/lib/diagnostics/contracts";
import { safeAppReturnTo } from "@/lib/auth/return-to";

export const COACH_MODEL = "velt-coach-v2" as const;
export const COACH_PAGE_SIZE = 20;
export const COACH_MAX_PAGE = 100_000;
export const COACH_READ_ROLES = ["owner", "admin", "editor", "viewer"] as const;
export const COACH_STATES = ["open", "completed", "dismissed", "conflicted"] as const;
export const COACH_FILTERS = ["open", "completed", "dismissed", "conflicted", "all"] as const;
export const COACH_KINDS = ["insight", "warning", "suggestion", "next_action"] as const;
export const COACH_SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export const JOURNEY_KINDS = ["decision", "result", "pivot", "signal", "reflection"] as const;
export const COACH_RULE_CODES = [
  "brandMissing",
  "brandIncomplete",
  "channelMissing",
  "channelDisconnected",
  "inventoryLow",
  "activityLow",
  "queueFailures",
  "queueNoEvidence",
  "reviewBaseline",
] as const;
export type CoachRuleCode = (typeof COACH_RULE_CODES)[number];
export type CoachState = (typeof COACH_STATES)[number];
export type CoachFilter = (typeof COACH_FILTERS)[number];
export type CoachPanel = "recommendations" | "journey";

const uuid = z.string().uuid();
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const page = z.number().int().min(1).max(COACH_MAX_PAGE);
export const coachBrowseSchema = z.object({
  status: z.enum(COACH_FILTERS).default("open"),
  page: page.default(1),
});
export const coachListInputSchema = coachBrowseSchema.extend({ workspaceId: uuid });
export const journeyListInputSchema = z.object({ workspaceId: uuid, page: page.default(1) });
export const coachGenerateInputSchema = z.object({ workspaceId: uuid, batchId: uuid });
export const coachStatusInputSchema = z.object({
  workspaceId: uuid,
  id: uuid,
  expectedUpdatedAt: diagnosticTimestamp,
  action: z.enum(["complete", "dismiss"]),
});
export type CoachGenerateInput = z.infer<typeof coachGenerateInputSchema>;
export type CoachStatusInput = z.infer<typeof coachStatusInputSchema>;
export type CoachBrowse = z.infer<typeof coachBrowseSchema>;

/** Stable compatibility text. Known v2 codes are translated when presented by the native UI. */
export const COACH_RULES = {
  brandMissing: {
    kind: "next_action",
    severity: "high",
    score: 95,
    title: "Estruture sua primeira marca",
    body: "Cadastre uma identidade para organizar o conteúdo. Isso não garante audiência ou vendas.",
    href: "/app/brands",
    label: "Revisar marcas",
  },
  brandIncomplete: {
    kind: "suggestion",
    severity: "medium",
    score: 75,
    title: "Revise a identidade das marcas",
    body: "O recorte tem voz, paleta ou logo não preenchidos. Conferir cadastro não comprova reconhecimento externo.",
    href: "/app/brands",
    label: "Revisar marcas",
  },
  channelMissing: {
    kind: "suggestion",
    severity: "medium",
    score: 70,
    title: "Avalie os canais da operação",
    body: "Nenhum canal foi encontrado na leitura confirmada. Conectar é opcional e exige sua própria autorização; você pode continuar com rascunhos.",
    href: "/app/channels",
    label: "Revisar canais",
  },
  channelDisconnected: {
    kind: "warning",
    severity: "high",
    score: 90,
    title: "Revise o estado registrado dos canais",
    body: "Há canais desconectados, expirados ou com bloqueio conhecido no recorte. Esta sugestão não testa o provedor nem reconecta a conta.",
    href: "/app/channels",
    label: "Revisar canais",
  },
  inventoryLow: {
    kind: "suggestion",
    severity: "medium",
    score: 65,
    title: "Organize sua base de conteúdo",
    body: "A base analisada tem poucos itens cadastrados. Escrever um rascunho não publica nem agenda conteúdo.",
    href: "/app/content",
    label: "Abrir conteúdo",
  },
  activityLow: {
    kind: "suggestion",
    severity: "medium",
    score: 60,
    title: "Planeje a criação de conteúdo",
    body: "A regra considera itens criados em 30 dias, incluindo rascunhos; não identifica a data da última publicação real.",
    href: "/app/content",
    label: "Abrir conteúdo",
  },
  queueFailures: {
    kind: "warning",
    severity: "high",
    score: 85,
    title: "Confira as falhas definitivas da fila",
    body: "Há falhas elegíveis no recorte. Revise o estado antes de decidir qualquer ação; o Coach não reenvia ou publica nada.",
    href: "/app/scheduler",
    label: "Revisar fila",
  },
  queueNoEvidence: {
    kind: "insight",
    severity: "info",
    score: 30,
    title: "Confira a base disponível da fila",
    body: "Não há evidência elegível para a taxa neste recorte. Isso não significa fracasso, ausência de publicações ou necessidade de reenviar.",
    href: "/app/scheduler",
    label: "Revisar fila",
  },
  reviewBaseline: {
    kind: "insight",
    severity: "info",
    score: 20,
    title: "Revise a base e mantenha seu planejamento",
    body: "Estas regras não encontraram pontos adicionais no recorte. Isso não comprova ausência de riscos nem desempenho externo.",
    href: "/app/score",
    label: "Ver metodologia do Score",
  },
} as const satisfies Record<
  CoachRuleCode,
  {
    kind: (typeof COACH_KINDS)[number];
    severity: (typeof COACH_SEVERITIES)[number];
    score: number;
    title: string;
    body: string;
    href: string;
    label: string;
  }
>;

const coachMetadataSchema = z.object({
  model: z.literal(COACH_MODEL),
  code: z.enum(COACH_RULE_CODES),
  evidence: diagnosticMetaSchema,
});
const ctaWithMethod = z.object({ href: z.string(), label: z.string(), coach: coachMetadataSchema });
export const coachRecordSchema = z.object({
  id: uuid,
  workspace_id: uuid,
  user_id: uuid.nullable(),
  kind: z.enum(COACH_KINDS),
  severity: z.enum(COACH_SEVERITIES),
  title: z.string(),
  body: z.string().nullable(),
  cta: z.json(),
  score: z.number(),
  created_at: diagnosticTimestamp,
  updated_at: diagnosticTimestamp,
  dismissed_at: diagnosticTimestamp.nullable(),
  completed_at: diagnosticTimestamp.nullable(),
});
export type CoachRecord = z.infer<typeof coachRecordSchema>;
export function coachState(row: Pick<CoachRecord, "completed_at" | "dismissed_at">): CoachState {
  if (row.completed_at !== null && row.dismissed_at !== null) return "conflicted";
  if (row.completed_at !== null) return "completed";
  return row.dismissed_at !== null ? "dismissed" : "open";
}
/** Necessary consistency checks available in the stored summary, not a re-read or proof of origin. */
export function coachRuleEvidence(code: CoachRuleCode, meta: z.infer<typeof diagnosticMetaSchema>) {
  switch (code) {
    case "brandMissing":
      return meta.sources.brands.loaded === 0;
    case "brandIncomplete":
      return meta.sources.brands.loaded > 0;
    case "channelMissing":
      return meta.sources.channels.loaded === 0;
    case "channelDisconnected":
      return meta.sources.channels.loaded > 0;
    case "inventoryLow":
      return meta.sources.content.loaded < 9;
    case "activityLow":
      return meta.recentCreated < 6;
    case "queueFailures":
      return meta.jobEvidence.failures > 0;
    case "queueNoEvidence":
      return meta.jobEvidence.successes + meta.jobEvidence.failures === 0;
    case "reviewBaseline":
      return (
        meta.sources.brands.loaded > 0 &&
        meta.sources.channels.loaded > 0 &&
        meta.sources.content.loaded >= 9 &&
        meta.recentCreated >= 6 &&
        meta.jobEvidence.successes > 0 &&
        meta.jobEvidence.failures === 0
      );
  }
}
export function coachMethod(row: CoachRecord) {
  const cta = row.cta;
  if (!cta || typeof cta !== "object" || !("coach" in cta)) return null;
  const method = ctaWithMethod.parse(cta);
  const rule = COACH_RULES[method.coach.code];
  if (
    method.href !== rule.href ||
    method.label !== rule.label ||
    row.kind !== rule.kind ||
    row.severity !== rule.severity ||
    row.score !== rule.score ||
    row.title !== rule.title ||
    row.body !== rule.body ||
    !coachRuleEvidence(method.coach.code, method.coach.evidence) ||
    Date.parse(row.created_at) !== Date.parse(method.coach.evidence.finishedAt)
  )
    throw new Error("Coach recommendation does not match its declared rule and evidence.");
  return method;
}
export function confirmCoachRecord(value: unknown, workspaceId: string): CoachRecord {
  const row = coachRecordSchema.parse(value);
  if (row.workspace_id !== workspaceId) throw new Error("Coach workspace was not confirmed.");
  coachMethod(row);
  return row;
}
/** Unsafe saved targets are omitted, never coerced into a default app action. */
export function coachAction(row: CoachRecord) {
  const cta = row.cta;
  if (!cta || typeof cta !== "object" || Array.isArray(cta) || typeof cta.href !== "string")
    return null;
  const safe = safeAppReturnTo(cta.href);
  return safe === cta.href
    ? { href: safe, label: typeof cta.label === "string" ? cta.label : null }
    : null;
}
const coachPageSchema = z.object({
  workspaceId: uuid,
  status: z.enum(COACH_FILTERS),
  page,
  pageSize: z.literal(COACH_PAGE_SIZE),
  total: count,
  checkedAt: diagnosticTimestamp,
  items: z.array(coachRecordSchema).max(COACH_PAGE_SIZE),
});
export type CoachPage = z.infer<typeof coachPageSchema>;
function completePage(value: {
  page: number;
  total: number;
  items: { id: string; workspace_id: string }[];
  workspaceId: string;
}) {
  const offset = (value.page - 1) * COACH_PAGE_SIZE;
  return (
    value.items.length === Math.min(COACH_PAGE_SIZE, Math.max(0, value.total - offset)) &&
    new Set(value.items.map((row) => row.id)).size === value.items.length &&
    value.items.every((row) => row.workspace_id === value.workspaceId)
  );
}
export function confirmCoachPage(
  value: unknown,
  input: z.infer<typeof coachListInputSchema>,
): CoachPage {
  const result = coachPageSchema.parse(value);
  if (
    !completePage(result) ||
    result.workspaceId !== input.workspaceId ||
    result.page !== input.page ||
    result.status !== input.status ||
    result.items.some((row) => input.status !== "all" && coachState(row) !== input.status)
  )
    throw new Error("Requested Coach page, scope, filter or exact count was not confirmed.");
  result.items.forEach((row) => coachMethod(row));
  return result;
}
export const journeyRecordSchema = z.object({
  id: uuid,
  workspace_id: uuid,
  user_id: uuid.nullable(),
  kind: z.enum(JOURNEY_KINDS),
  subject: z.string(),
  payload: z.json(),
  sentiment: z.string().nullable(),
  created_at: diagnosticTimestamp,
});
export type JourneyRecord = z.infer<typeof journeyRecordSchema>;
const journeyPageSchema = z.object({
  workspaceId: uuid,
  page,
  pageSize: z.literal(COACH_PAGE_SIZE),
  total: count,
  checkedAt: diagnosticTimestamp,
  items: z.array(journeyRecordSchema).max(COACH_PAGE_SIZE),
});
export type JourneyPage = z.infer<typeof journeyPageSchema>;
export function confirmJourneyPage(
  value: unknown,
  input: z.infer<typeof journeyListInputSchema>,
): JourneyPage {
  const result = journeyPageSchema.parse(value);
  if (
    !completePage(result) ||
    result.workspaceId !== input.workspaceId ||
    result.page !== input.page
  )
    throw new Error("Requested journey page, scope or exact count was not confirmed.");
  return result;
}

export const coachGenerationReceiptSchema = z.object({
  generated: z.number().int().min(1).max(8),
  recommendations: z.array(coachRecordSchema).min(1).max(8),
  evidence: diagnosticMetaSchema,
  eventRecorded: z.boolean(),
});
export function confirmCoachGeneration(value: unknown, input: CoachGenerateInput, userId: string) {
  const result = coachGenerationReceiptSchema.parse(value);
  const rows = result.recommendations.map((row) => confirmCoachRecord(row, input.workspaceId));
  if (
    result.evidence.calculationId !== input.batchId ||
    result.generated !== rows.length ||
    new Set(rows.map((row) => row.id)).size !== rows.length ||
    new Set(rows.map((row) => coachMethod(row)?.coach.code)).size !== rows.length ||
    rows.some(
      (row) =>
        row.user_id !== userId ||
        coachState(row) !== "open" ||
        JSON.stringify(coachMethod(row)?.coach.evidence) !== JSON.stringify(result.evidence) ||
        Date.parse(row.updated_at) !== Date.parse(row.created_at),
    )
  )
    throw new Error("The Coach generation receipt was not confirmed.");
  return { ...result, recommendations: rows };
}
export function confirmSavedCoachBatch(
  value: unknown,
  expected: CoachRecord[],
  input: CoachGenerateInput,
  userId: string,
  evidence: z.infer<typeof diagnosticMetaSchema>,
) {
  const receipt = confirmCoachGeneration(
    { generated: expected.length, recommendations: value, evidence, eventRecorded: false },
    input,
    userId,
  );
  if (
    receipt.recommendations.some((row) => {
      const sent = expected.find((item) => item.id === row.id);
      return (
        !sent ||
        row.title !== sent.title ||
        row.body !== sent.body ||
        row.kind !== sent.kind ||
        row.severity !== sent.severity ||
        row.score !== sent.score ||
        Date.parse(row.created_at) !== Date.parse(sent.created_at) ||
        JSON.stringify(coachMethod(row)) !== JSON.stringify(coachMethod(sent))
      );
    })
  )
    throw new Error("The inserted Coach batch was not confirmed.");
  return receipt;
}
export function confirmCoachStatus(value: unknown, input: CoachStatusInput, recordedAt?: string) {
  const row = confirmCoachRecord(value, input.workspaceId);
  const target = input.action === "complete" ? "completed" : "dismissed";
  const stamp = target === "completed" ? row.completed_at : row.dismissed_at;
  if (
    row.id !== input.id ||
    coachState(row) !== target ||
    (recordedAt && Date.parse(stamp ?? "") !== Date.parse(recordedAt))
  )
    throw new Error("The manual Coach status was not confirmed.");
  return row;
}
