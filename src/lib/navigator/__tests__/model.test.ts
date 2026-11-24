import { describe, expect, it } from "vitest";
import { compatibilityMaturity, navigatorActions, navigatorProfilePayload } from "../model";
import {
  NAVIGATOR_CHANNELS,
  NAVIGATOR_CONTENT,
  NAVIGATOR_GOALS,
  NAVIGATOR_PATHS,
} from "../options";
import { navigatorAnswers, nativeNavigatorPlan } from "../contracts";
import { answers, at, profile, revisionId } from "./fixtures";

describe("Navigator deterministic and explicitly limited rules", () => {
  it.each([
    ["beginner", 0, [], "seed"],
    ["beginner", 1000000, [], "seed"],
    ["beginner", 0, ["A"], "seed"],
    ["beginner", 0, ["A", "B"], "sprout"],
    ["intermediate", 0, [], "growth"],
    ["intermediate", 1000000, ["A", "B"], "growth"],
    ["advanced", 0, [], "established"],
    ["advanced", 1000, ["A", "B"], "established"],
    ["advanced", 1000.01, [], "scaling"],
    ["advanced", 1000000, [], "scaling"],
  ] as const)(
    "preserves the legacy enum formula for %s / %s / %j without asserting maturity",
    (experience_level, money_budget_monthly, goals, expected) => {
      expect(
        compatibilityMaturity(
          answers({ experience_level, money_budget_monthly, goals: [...goals] }),
        ),
      ).toBe(expected);
    },
  );
  it.each(["beginner", "intermediate", "advanced"] as const)(
    "uses only self-described experience and presence of channel preferences for %s",
    (experience_level) => {
      for (const preferred_channels of [[], ["Instagram"], ["Earlier channel"]]) {
        const result = navigatorActions(
          answers({ experience_level, preferred_channels }),
          revisionId,
          at,
        );
        expect(result.map((item) => item.navigator.code)).toEqual([
          "reviewBrand",
          "draftContent",
          preferred_channels.length ? "reviewChannels" : "considerChannels",
          ...(experience_level === "beginner" ? ["learnBasics"] : []),
        ]);
        expect(
          result.every(
            (item) =>
              item.href.startsWith("/app/") &&
              item.navigator.revisionId === revisionId &&
              item.navigator.savedAt === at &&
              item.navigator.model === "velt-navigator-v2",
          ),
        ).toBe(true);
      }
    },
  );
  it.each(NAVIGATOR_PATHS)(
    "does not falsely personalize the outline based on business path %s",
    (business_path) => {
      expect(navigatorActions(answers({ business_path }), revisionId, at)).toEqual(
        navigatorActions(answers(), revisionId, at),
      );
    },
  );
  it.each([
    { goals: [] },
    { goals: ["Other goal", "Another"] },
    { time_budget_hours_week: 168 },
    { money_budget_monthly: 1000000 },
    { content_preferences: ["Newsletter"] },
  ])("does not claim goals, hours, budget or formats alter the suggestions: %j", (patch) => {
    expect(navigatorActions(answers(patch), revisionId, at)).toEqual(
      navigatorActions(answers(), revisionId, at),
    );
  });
  it("produces a complete compatible payload without modifying the answers or doing other work", () => {
    const source = answers(),
      original = structuredClone(source),
      result = navigatorProfilePayload(source, revisionId, at);
    expect(navigatorAnswers(result)).toEqual(original);
    expect(source).toEqual(original);
    expect(result).toMatchObject({ completed_at: at, maturity_level: "seed" });
    expect(Object.keys(result).sort()).toEqual(
      [...Object.keys(original), "completed_at", "maturity_level", "recommended_actions"].sort(),
    );
    expect(nativeNavigatorPlan(profile({ ...result }))?.actions).toHaveLength(4);
  });
  it("retains the exact stored PT choices instead of replacing historical values with translated labels", () => {
    expect(NAVIGATOR_GOALS.map((option) => option.value)).toEqual([
      "Primeiros clientes",
      "Construir audiência",
      "Lançar produto",
      "Aumentar vendas",
      "Crescer presença",
      "Automatizar processos",
      "Validar ideia",
      "Reduzir custos",
    ]);
    expect(NAVIGATOR_CHANNELS.map((option) => option.value)).toContain("Google Business");
    expect(NAVIGATOR_CONTENT.map((option) => option.value)).toContain("Vídeos longos");
  });
});
