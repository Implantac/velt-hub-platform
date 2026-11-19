import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const DASHBOARD_QUESTIONS = [
  "where_am_i",
  "where_to_go",
  "whats_blocking",
  "next_action",
  "should_pivot",
] as const satisfies readonly Database["public"]["Enums"]["brain_question"][];

export const dashboardScoreSchema = z.number().finite().min(0).max(100);
const timestamp = z.string().datetime({ offset: true });
const answerSchema = z.object({
  question: z.enum(DASHBOARD_QUESTIONS),
  headline: z.string().min(1),
  body: z.string().nullish(),
  cta: z.object({ href: z.string(), label: z.string() }).nullish(),
  confidence: z.number().finite().min(0).max(1).nullish(),
  aiNote: z.string().nullish(),
  source: z.enum(["rules", "ai"]).optional(),
});

export type SavedDashboardAnswer = z.infer<typeof answerSchema> & {
  computedAt: string;
  expiresAt: string | null;
  expired: boolean;
};

type Tables = Database["public"]["Tables"];
export function savedDashboardScore(
  row: Pick<Tables["brain_snapshots"]["Row"], "scores" | "computed_at"> | null,
) {
  if (row === null) return null;
  const scores = z.object({ overall: dashboardScoreSchema }).parse(row.scores);
  return { overall: scores.overall, computedAt: timestamp.parse(row.computed_at) };
}

export function savedDashboardAnswer(
  row: Pick<Tables["brain_answers"]["Row"], "question" | "answer" | "computed_at" | "expires_at">,
  checkedAt: string,
): SavedDashboardAnswer {
  const answer = answerSchema.parse(row.answer);
  if (answer.question !== row.question)
    throw new Error("Saved dashboard answer does not match its question.");
  const computedAt = timestamp.parse(row.computed_at);
  const expiresAt = row.expires_at === null ? null : timestamp.parse(row.expires_at);
  return {
    ...answer,
    computedAt,
    expiresAt,
    expired: expiresAt !== null && Date.parse(expiresAt) <= Date.parse(checkedAt),
  };
}
