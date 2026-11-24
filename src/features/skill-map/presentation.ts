import { z } from "zod";
import {
  SKILL_AREAS,
  skillAssessmentEqual,
  skillAssessmentFor,
  type SkillArea,
  type SkillAssessment,
  type SkillReceipt,
  type SkillSnapshot,
} from "@/lib/skill-map/contracts";

export type SkillEditor = {
  area: SkillArea;
  score: string;
  notes: string;
  expected: SkillAssessment | null;
  step: "edit" | "review";
};
export type SkillView = { editor: SkillEditor | null; receipt: SkillReceipt | null };
export const skillDraftSchema = z
  .object({
    score: z
      .string()
      .trim()
      .regex(/^\d{1,3}$/)
      .transform(Number)
      .pipe(z.number().int().min(0).max(100)),
    notes: z
      .string()
      .max(500)
      .transform((value) => (value === "" ? null : value)),
  })
  .strict();
export function skillEditor(area: SkillArea, row: SkillAssessment | null): SkillEditor {
  return {
    area,
    score: row ? String(row.score) : "",
    notes: row?.notes ?? "",
    expected: row,
    step: "edit",
  };
}
export const skillQueryRoot = (userId: string, workspaceId: string) =>
  ["skill-map", userId, workspaceId] as const;
export const skillQueryKey = (userId: string, workspaceId: string) =>
  [...skillQueryRoot(userId, workspaceId), "records"] as const;
export const skillViewKey = (userId: string, workspaceId: string) =>
  [...skillQueryRoot(userId, workspaceId), "view"] as const;
export const skillOperationScope = (userId: string, workspaceId: string) =>
  JSON.stringify([userId, workspaceId]);
export const canReadSkillMap = (role: unknown) =>
  ["owner", "admin", "editor", "viewer"].some((known) => known === role);
export const skillReadState = (query: { data: unknown; isError: boolean }) =>
  query.data === undefined
    ? query.isError
      ? "error"
      : "loading"
    : query.isError
      ? "stale"
      : "ready";
export function skillEditorMatches(editor: SkillEditor, snapshot: SkillSnapshot | undefined) {
  return (
    snapshot !== undefined &&
    skillAssessmentEqual(editor.expected, skillAssessmentFor(snapshot, editor.area))
  );
}
export function skillNeedsSave(editor: SkillEditor, draft: z.infer<typeof skillDraftSchema>) {
  return (
    editor.expected === null ||
    editor.expected.score !== draft.score ||
    editor.expected.notes !== draft.notes ||
    editor.expected.source !== "self"
  );
}
export function skillBand(score: number | null) {
  return score === null ? "unassessed" : score < 30 ? "low" : score < 80 ? "middle" : "high";
}
export function skillStats(snapshot: SkillSnapshot) {
  return {
    assessed: snapshot.total,
    unassessed: SKILL_AREAS.length - snapshot.total,
    high: snapshot.items.filter((row) => row.score >= 80).length,
  };
}
export function skillDate(value: string, language: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Intl.DateTimeFormat(language.startsWith("en") ? "en-US" : "pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(time);
}
