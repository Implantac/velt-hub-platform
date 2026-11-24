import {
  navigatorAnswers,
  navigatorAnswersEqual,
  navigatorAnswersSchema,
  navigatorBudget,
  navigatorHours,
  nativeNavigatorPlan,
  type NavigatorAnswers,
  type NavigatorRecord,
} from "@/lib/navigator/contracts";
import { z } from "zod";
import { safeAppReturnTo } from "@/lib/auth/return-to";

export type NavigatorDraft = Omit<
  NavigatorAnswers,
  "time_budget_hours_week" | "money_budget_monthly"
> & { time_budget_hours_week: string; money_budget_monthly: string };
export const navigatorDraftSchema = navigatorAnswersSchema
  .omit({ time_budget_hours_week: true, money_budget_monthly: true })
  .extend({
    time_budget_hours_week: z
      .string()
      .trim()
      .regex(/^\d{1,3}$/)
      .transform(Number)
      .pipe(navigatorHours),
    money_budget_monthly: z
      .string()
      .trim()
      .regex(/^\d+(?:[.,]\d{1,2})?$/)
      .transform((value) => Number(value.replace(",", ".")))
      .pipe(navigatorBudget),
  })
  .pipe(navigatorAnswersSchema);
export function navigatorDraft(row: NavigatorRecord | null): NavigatorDraft {
  const base = row
    ? navigatorAnswers(row)
    : {
        experience_level: "beginner" as const,
        business_path: null,
        goals: [],
        time_budget_hours_week: 5,
        money_budget_monthly: 0,
        preferred_channels: [],
        content_preferences: [],
      };
  return {
    ...base,
    time_budget_hours_week: String(base.time_budget_hours_week),
    money_budget_monthly: String(base.money_budget_monthly),
  };
}
export const navigatorQueryKey = (userId: string) => ["navigator-profile", userId] as const;
/** Ephemeral account-keyed React Query memory only; never localStorage, persistence or workspace data. */
export const navigatorDraftKey = (userId: string) => ["navigator-draft", userId] as const;
export const navigatorReadState = (query: { data: unknown; isError: boolean }) =>
  query.data === undefined
    ? query.isError
      ? "error"
      : "loading"
    : query.isError
      ? "stale"
      : "ready";
export function navigatorDate(value: string, language: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Intl.DateTimeFormat(language.startsWith("en") ? "en-US" : "pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(time);
}
export function navigatorInternalHref(value: unknown) {
  if (typeof value !== "string") return null;
  const safe = safeAppReturnTo(value);
  return safe === value ? safe : null;
}
export function navigatorVersion(row: NavigatorRecord | null) {
  return row?.updated_at ?? null;
}
export function navigatorNeedsSave(answers: NavigatorAnswers, row: NavigatorRecord | null) {
  return row === null || !nativeNavigatorPlan(row) || !navigatorAnswersEqual(answers, row);
}
export function legacyNavigatorActions(value: NavigatorRecord["recommended_actions"]) {
  if (!Array.isArray(value)) return { items: [], total: 0 };
  const actions = value.flatMap((entry) =>
    entry &&
    typeof entry === "object" &&
    !Array.isArray(entry) &&
    typeof entry.title === "string" &&
    entry.title.trim()
      ? [{ title: entry.title, href: navigatorInternalHref(entry.href) }]
      : [],
  );
  return { items: actions.slice(0, 20), total: actions.length };
}
export type NavigatorFeedback = {
  kind: "saved" | "unconfirmed" | "refreshed";
  reference?: string;
  mode?: "created" | "updated";
  readFailed?: boolean;
};
