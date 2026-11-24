import type { NavigatorAnswers, NavigatorRecord } from "./contracts";
import { NAVIGATOR_ACTIONS, NAVIGATOR_MODEL, type NavigatorActionCode } from "./options";

/** Legacy enum compatibility ONLY: not a measured assessment of a person or business. */
export function compatibilityMaturity(input: NavigatorAnswers): NavigatorRecord["maturity_level"] {
  if (input.experience_level === "advanced" && input.money_budget_monthly > 1000) return "scaling";
  if (input.experience_level === "advanced") return "established";
  if (input.experience_level === "intermediate") return "growth";
  return input.goals.length >= 2 ? "sprout" : "seed";
}
export function navigatorActions(input: NavigatorAnswers, revisionId: string, savedAt: string) {
  const codes: NavigatorActionCode[] = [
    "reviewBrand",
    "draftContent",
    input.preferred_channels.length ? "reviewChannels" : "considerChannels",
  ];
  if (input.experience_level === "beginner") codes.push("learnBasics");
  return codes.map((code) => ({
    ...NAVIGATOR_ACTIONS[code],
    navigator: { model: NAVIGATOR_MODEL, code, revisionId, savedAt },
  }));
}
/** Pure local rules; no network, workspace, onboarding, AI, posts or other saved analysis. */
export function navigatorProfilePayload(
  answers: NavigatorAnswers,
  revisionId: string,
  savedAt: string,
) {
  return {
    ...answers,
    maturity_level: compatibilityMaturity(answers),
    recommended_actions: navigatorActions(answers, revisionId, savedAt),
    completed_at: savedAt,
  };
}
