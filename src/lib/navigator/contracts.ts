import { z } from "zod";
import { compatibilityMaturity, navigatorActions } from "./model";
import {
  NAVIGATOR_ACTIONS,
  NAVIGATOR_EXPERIENCE,
  NAVIGATOR_MATURITY,
  NAVIGATOR_MODEL,
  NAVIGATOR_PATHS,
} from "./options";

export const navigatorTimestamp = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)));
/** Compare timezone-equivalent instants without discarding Postgres sub-millisecond precision. */
export function navigatorSameInstant(a: string, b: string) {
  const token = (value: string) => {
    const milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds)) return null;
    const fraction = (/\.(\d+)/.exec(value)?.[1] ?? "").replace(/0+$/, "");
    return `${Math.floor(milliseconds / 1000)}:${fraction}`;
  };
  const first = token(a);
  return first !== null && first === token(b);
}
export const navigatorHours = z.number().int().min(0).max(168);
export const navigatorBudget = z
  .number()
  .min(0)
  .max(1_000_000)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
    "Use at most two decimal places.",
  );
const choices = (length: number, maximum: number) =>
  z
    .array(z.string().trim().min(1).max(length))
    .max(maximum)
    .transform((values) => [...new Set(values)]);
export const navigatorAnswersSchema = z
  .object({
    experience_level: z.enum(NAVIGATOR_EXPERIENCE),
    business_path: z.enum(NAVIGATOR_PATHS).nullable(),
    goals: choices(80, 12),
    time_budget_hours_week: navigatorHours,
    money_budget_monthly: navigatorBudget,
    preferred_channels: choices(40, 20),
    content_preferences: choices(40, 20),
  })
  .strict();
export type NavigatorAnswers = z.infer<typeof navigatorAnswersSchema>;
export const navigatorSaveInputSchema = z
  .object({
    answers: navigatorAnswersSchema,
    expectedUpdatedAt: navigatorTimestamp.nullable(),
    revisionId: z.string().uuid(),
  })
  .strict();
export type NavigatorSaveInput = z.infer<typeof navigatorSaveInputSchema>;
/** Keep original legacy text/numeric values in reads; input normalization never rewrites a read. */
export const navigatorRecordSchema = z.object({
  user_id: z.string().uuid(),
  experience_level: z.enum(NAVIGATOR_EXPERIENCE),
  business_path: z.enum(NAVIGATOR_PATHS).nullable(),
  goals: z.array(z.string()),
  time_budget_hours_week: z.number().int(),
  money_budget_monthly: z.number(),
  preferred_channels: z.array(z.string()),
  content_preferences: z.array(z.string()),
  maturity_level: z.enum(NAVIGATOR_MATURITY),
  recommended_actions: z.json(),
  created_at: navigatorTimestamp,
  updated_at: navigatorTimestamp,
  completed_at: navigatorTimestamp.nullable(),
});
export type NavigatorRecord = z.infer<typeof navigatorRecordSchema>;
export function navigatorAnswers(row: NavigatorAnswers): NavigatorAnswers {
  return {
    experience_level: row.experience_level,
    business_path: row.business_path,
    goals: [...row.goals],
    time_budget_hours_week: row.time_budget_hours_week,
    money_budget_monthly: row.money_budget_monthly,
    preferred_channels: [...row.preferred_channels],
    content_preferences: [...row.content_preferences],
  };
}
export function navigatorAnswersEqual(a: NavigatorAnswers, b: NavigatorAnswers) {
  return JSON.stringify(navigatorAnswers(a)) === JSON.stringify(navigatorAnswers(b));
}
const actionSchema = z
  .object({
    title: z.string(),
    href: z.string(),
    navigator: z
      .object({
        model: z.literal(NAVIGATOR_MODEL),
        code: z.enum(
          Object.keys(NAVIGATOR_ACTIONS) as [
            keyof typeof NAVIGATOR_ACTIONS,
            ...(keyof typeof NAVIGATOR_ACTIONS)[],
          ],
        ),
        revisionId: z.string().uuid(),
        savedAt: navigatorTimestamp,
      })
      .strict(),
  })
  .strict();
function declaresNative(value: unknown) {
  return !!value && typeof value === "object" && "navigator" in value;
}
export function nativeNavigatorPlan(row: NavigatorRecord) {
  const raw = row.recommended_actions;
  if (!declaresNative(raw) && (!Array.isArray(raw) || !raw.some(declaresNative))) return null;
  const actions = z.array(actionSchema).min(3).max(4).parse(raw);
  const declared = actions[0].navigator;
  const original = navigatorAnswers(row),
    normalized = navigatorAnswersSchema.parse(original);
  if (
    !navigatorAnswersEqual(original, normalized) ||
    row.maturity_level !== compatibilityMaturity(normalized) ||
    row.completed_at === null ||
    !navigatorSameInstant(row.completed_at, declared.savedAt) ||
    JSON.stringify(actions) !==
      JSON.stringify(navigatorActions(normalized, declared.revisionId, declared.savedAt))
  )
    throw new Error("Navigator profile does not match its declared rules, answers or revision.");
  return { ...declared, actions };
}
export function confirmNavigatorProfile(value: unknown, userId: string): NavigatorRecord | null {
  if (value === null) return null;
  const row = navigatorRecordSchema.parse(value);
  if (row.user_id !== userId)
    throw new Error("Personal Navigator profile owner was not confirmed.");
  nativeNavigatorPlan(row);
  return row;
}
const receiptSchema = z
  .object({ profile: navigatorRecordSchema, mode: z.enum(["created", "updated"]) })
  .strict();
export function confirmNavigatorReceipt(
  value: unknown,
  input: NavigatorSaveInput,
  userId: string,
  savedAt?: string,
) {
  const receipt = receiptSchema.parse(value),
    row = confirmNavigatorProfile(receipt.profile, userId)!;
  const method = nativeNavigatorPlan(row);
  if (
    !method ||
    method.revisionId !== input.revisionId ||
    receipt.mode !== (input.expectedUpdatedAt === null ? "created" : "updated") ||
    !navigatorAnswersEqual(row, input.answers) ||
    (input.expectedUpdatedAt !== null &&
      navigatorSameInstant(row.updated_at, input.expectedUpdatedAt)) ||
    (receipt.mode === "created" && !navigatorSameInstant(row.created_at, row.completed_at!)) ||
    (savedAt !== undefined && !navigatorSameInstant(row.completed_at!, savedAt))
  )
    throw new Error("The saved Navigator revision was not confirmed.");
  return receipt;
}
