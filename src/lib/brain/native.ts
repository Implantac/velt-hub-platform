import { z } from "zod";

/** Native Brain is a rules/memory tool, not the AI snapshot orchestrator. */
export const BRAIN_PREVIEW_LIMIT = 50;
export const BRAIN_MEMORY_KINDS = [
  "goal",
  "fact",
  "preference",
  "strategy",
  "signal",
  "outcome",
] as const;
export const BRAIN_REC_STATUSES = ["open", "applied", "dismissed", "expired"] as const;
export const brainLanguageSchema = z.enum(["pt-BR", "en-US"]);
export type BrainLanguage = z.infer<typeof brainLanguageSchema>;
export type MemoryKind = (typeof BRAIN_MEMORY_KINDS)[number];
export type RecStatus = (typeof BRAIN_REC_STATUSES)[number];
export type BrainStatusChange = "applied" | "dismissed";
const timestamp = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)));
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const brainMemoryInputSchema = z.object({
  kind: z.enum(BRAIN_MEMORY_KINDS),
  content: z.string().trim().min(2).max(4000),
});
export const nativeMemorySchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(BRAIN_MEMORY_KINDS),
  content: z.string(),
  created_at: timestamp,
});
export const nativeRecommendationSchema = z.object({
  id: z.string().uuid(),
  kind: z.string().min(1),
  title: z.string().min(1),
  rationale: z.string().nullable(),
  score: z.number().finite().min(0).max(1),
  status: z.enum(BRAIN_REC_STATUSES),
  expires_at: timestamp.nullable(),
  created_at: timestamp,
});
function validPreview(value: { items: unknown[]; total: number }) {
  return value.items.length === Math.min(value.total, BRAIN_PREVIEW_LIMIT);
}
export const nativeRecommendationsSchema = z
  .object({
    items: z.array(nativeRecommendationSchema).max(BRAIN_PREVIEW_LIMIT),
    total: count,
    limit: z.literal(BRAIN_PREVIEW_LIMIT),
    checkedAt: timestamp,
  })
  .refine(validPreview, "Preview does not match the confirmed first page.");
export const nativeMemoriesSchema = z
  .object({
    items: z.array(nativeMemorySchema).max(BRAIN_PREVIEW_LIMIT),
    total: count,
    limit: z.literal(BRAIN_PREVIEW_LIMIT),
    checkedAt: timestamp,
  })
  .refine(validPreview, "Preview does not match the confirmed first page.");
export const nativeGenerationSchema = z.object({
  generated: count,
  eventRecorded: z.boolean(),
});
export const nativeStatusReceiptSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  status: z.enum(["applied", "dismissed"]),
});
export type NativeMemory = z.infer<typeof nativeMemorySchema>;
export type NativeRecommendation = z.infer<typeof nativeRecommendationSchema>;
export type NativeMemories = z.infer<typeof nativeMemoriesSchema>;
export type NativeRecommendations = z.infer<typeof nativeRecommendationsSchema>;

/** A missing count is unavailable, never a confirmed zero. */
export function nativeBrainCount(value: unknown) {
  return count.parse(value);
}
export function effectiveBrainStatus(rec: NativeRecommendation, checkedAt: string): RecStatus {
  return rec.status === "open" &&
    rec.expires_at !== null &&
    Date.parse(rec.expires_at) <= Date.parse(checkedAt)
    ? "expired"
    : rec.status;
}

export const nativeRuleCountsSchema = z
  .object({
    brands: count,
    connectedChannels: count,
    content: count,
    drafts: count,
    activeMissions: count,
  })
  .refine((value) => value.drafts <= value.content, "Draft total exceeds content total.");
export type NativeRuleCounts = z.infer<typeof nativeRuleCountsSchema>;
export type NativeRuleRecommendation = {
  kind: string;
  title: string;
  rationale: string;
  score: number;
  payload: { action: string; optional?: boolean };
};

/** Explainable, local rules; no SDK, writes, network, AI or provider calls. */
export function nativeBrainRecommendations(
  input: NativeRuleCounts,
  language: BrainLanguage,
): NativeRuleRecommendation[] {
  const state = nativeRuleCountsSchema.parse(input);
  const en = language === "en-US";
  const recs: NativeRuleRecommendation[] = [];
  if (state.brands === 0)
    recs.push({
      kind: "setup.brand",
      title: en ? "Define your first brand" : "Defina sua primeira marca",
      rationale: en
        ? "Save a name and identity to organize your workspace."
        : "Salve um nome e uma identidade para organizar seu workspace.",
      score: 0.95,
      payload: { action: "create_brand" },
    });
  if (state.content === 0)
    recs.push({
      kind: "ops.create",
      title: en ? "Write your first draft" : "Escreva seu primeiro rascunho",
      rationale: en
        ? "Save an idea without sending anything to social networks."
        : "Salve uma ideia sem enviar nada às redes sociais.",
      score: 0.9,
      payload: { action: "create_content" },
    });
  if (state.drafts >= 3)
    recs.push({
      kind: "ops.publish",
      title: en
        ? `Review your ${new Intl.NumberFormat(language).format(state.drafts)} saved drafts`
        : `Revise seus ${new Intl.NumberFormat(language).format(state.drafts)} rascunhos salvos`,
      rationale: en
        ? "Choose what is ready and plan a schedule. This suggestion does not publish or schedule anything."
        : "Escolha o que está pronto e planeje a agenda. Esta sugestão não publica nem agenda nada.",
      score: 0.6,
      payload: { action: "open_scheduler" },
    });
  if (state.activeMissions === 0)
    recs.push({
      kind: "growth.mission",
      title: en ? "Define a short, measurable mission" : "Defina uma missão curta e mensurável",
      rationale: en
        ? "There are no pending or in-progress missions. Choose a realistic next goal."
        : "Não há missões pendentes ou em andamento. Escolha um próximo objetivo realista.",
      score: 0.55,
      payload: { action: "create_mission" },
    });
  if (state.connectedChannels === 0)
    recs.push({
      kind: "setup.channel",
      title: en ? "Connect a channel when you are ready" : "Conecte um canal quando estiver pronto",
      rationale: en
        ? "Optional: a connection requires your own authorization and credentials. You can keep working on drafts without one."
        : "Opcional: uma conexão exige sua autorização e credenciais próprias. Você pode continuar criando rascunhos sem ela.",
      score: 0.35,
      payload: { action: "connect_channel", optional: true },
    });
  return recs;
}
