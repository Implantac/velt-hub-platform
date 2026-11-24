import type { NavigatorAnswers, NavigatorRecord, NavigatorSaveInput } from "../contracts";
import { navigatorProfilePayload } from "../model";
export const userId = "00000000-0000-4000-8000-000000000021";
export const otherUser = "00000000-0000-4000-8000-000000000022";
export const revisionId = "00000000-0000-4000-8000-000000000071";
export const otherRevision = "00000000-0000-4000-8000-000000000072";
export const at = "2026-11-12T15:00:00.000Z";
export const earlier = "2026-11-12T14:00:00.000Z";
export const later = "2026-11-12T15:05:00.000Z";
export function answers(overrides: Partial<NavigatorAnswers> = {}): NavigatorAnswers {
  return {
    experience_level: "beginner",
    business_path: null,
    goals: ["Primeiros clientes"],
    time_budget_hours_week: 5,
    money_budget_monthly: 0,
    preferred_channels: [],
    content_preferences: ["Posts"],
    ...overrides,
  };
}
export function input(overrides: Partial<NavigatorSaveInput> = {}): NavigatorSaveInput {
  return { answers: answers(), expectedUpdatedAt: null, revisionId, ...overrides };
}
export function profile(
  overrides: Partial<NavigatorRecord> = {},
  answerOverrides: Partial<NavigatorAnswers> = {},
): NavigatorRecord {
  return {
    user_id: userId,
    ...navigatorProfilePayload(answers(answerOverrides), revisionId, at),
    created_at: at,
    updated_at: at,
    ...overrides,
  };
}
export function legacy(overrides: Partial<NavigatorRecord> = {}): NavigatorRecord {
  return profile({
    recommended_actions: [
      { title: "Original <script>not code</script>", href: "javascript:alert(1)" },
    ],
    completed_at: null,
    ...overrides,
  });
}
