import { describe, expect, it } from "vitest";
import {
  answers,
  at,
  legacy,
  otherUser,
  profile,
  userId,
} from "@/lib/navigator/__tests__/fixtures";
import {
  legacyNavigatorActions,
  navigatorDate,
  navigatorDraft,
  navigatorDraftKey,
  navigatorDraftSchema,
  navigatorInternalHref,
  navigatorNeedsSave,
  navigatorQueryKey,
  navigatorReadState,
  navigatorVersion,
} from "../presentation";

describe("Navigator account-scoped draft and presentation", () => {
  it("has explicit starting defaults only for a confirmed absent profile", () => {
    expect(navigatorDraft(null)).toEqual({
      experience_level: "beginner",
      business_path: null,
      goals: [],
      time_budget_hours_week: "5",
      money_budget_monthly: "0",
      preferred_channels: [],
      content_preferences: [],
    });
  });
  it("prefills every saved answer, including original choices and numeric values above the old slider limits", () => {
    const row = legacy({
      experience_level: "advanced",
      business_path: "saas_builder",
      goals: [" Custom ", "Custom"],
      time_budget_hours_week: 120,
      money_budget_monthly: 900000.45,
      preferred_channels: ["Earlier channel"],
      content_preferences: ["Earlier format"],
    });
    const draft = navigatorDraft(row);
    expect(draft).toMatchObject({
      experience_level: "advanced",
      business_path: "saas_builder",
      time_budget_hours_week: "120",
      money_budget_monthly: "900000.45",
      goals: [" Custom ", "Custom"],
      preferred_channels: ["Earlier channel"],
      content_preferences: ["Earlier format"],
    });
    expect(draft.goals).not.toBe(row.goals);
    expect(draft.preferred_channels).not.toBe(row.preferred_channels);
    expect(draft.content_preferences).not.toBe(row.content_preferences);
    draft.goals.push("New choice");
    expect(row.goals).toEqual([" Custom ", "Custom"]);
  });
  it("keeps legacy values outside current input limits visible rather than clamping or defaulting them", () => {
    const draft = navigatorDraft(
      legacy({
        time_budget_hours_week: 200,
        money_budget_monthly: 2000000.123,
        goals: ["x".repeat(81)],
      }),
    );
    expect(draft.time_budget_hours_week).toBe("200");
    expect(draft.money_budget_monthly).toBe("2000000.123");
    expect(draft.goals[0]).toHaveLength(81);
    expect(navigatorDraftSchema.safeParse(draft).success).toBe(false);
  });
  it.each([
    ["0", 0],
    ["168", 168],
    ["005", 5],
    [" 120 ", 120],
  ])("accepts complete integer hours %s as %s", (value, expected) => {
    expect(
      navigatorDraftSchema.parse({ ...navigatorDraft(null), time_budget_hours_week: value })
        .time_budget_hours_week,
    ).toBe(expected);
  });
  it.each(["", " ", "-1", "169", "5.5", "5,0", "1e2", "0x10", "Infinity", "NaN", "1 2", "0000"])(
    "does not coerce or clamp invalid hour text %s",
    (value) => {
      expect(
        navigatorDraftSchema.safeParse({ ...navigatorDraft(null), time_budget_hours_week: value })
          .success,
      ).toBe(false);
    },
  );
  it.each([
    ["0", 0],
    ["0.29", 0.29],
    ["0,29", 0.29],
    [" 123,45 ", 123.45],
    ["900000.45", 900000.45],
    ["1000000,00", 1000000],
  ])("parses BRL text %s explicitly as %s", (value, expected) => {
    expect(
      navigatorDraftSchema.parse({ ...navigatorDraft(null), money_budget_monthly: value })
        .money_budget_monthly,
    ).toBe(expected);
  });
  it.each([
    "",
    " ",
    "-1",
    "1000000.01",
    "1.001",
    "1,001",
    "1,000.00",
    "R$ 10",
    "1e3",
    ".50",
    "NaN",
    "Infinity",
    "10.",
  ])("rejects ambiguous or out-of-range currency %s", (value) => {
    expect(
      navigatorDraftSchema.safeParse({ ...navigatorDraft(null), money_budget_monthly: value })
        .success,
    ).toBe(false);
  });
  it("produces the same canonical complete answers as the server schema, regardless of draft key order", () => {
    const draft = navigatorDraft(profile());
    expect(Object.keys(navigatorDraftSchema.parse(draft))).toEqual(Object.keys(answers()));
    expect(navigatorDraftSchema.parse(draft)).toEqual(answers());
  });
  it("normalizes explicit saves without modifying the draft the user can still inspect", () => {
    const draft = navigatorDraft(legacy({ goals: [" Custom ", "Custom"] })),
      original = structuredClone(draft);
    expect(navigatorDraftSchema.parse(draft).goals).toEqual(["Custom"]);
    expect(draft).toEqual(original);
  });
  it("isolates query data by account, deliberately not workspace", () => {
    expect(navigatorQueryKey(userId)).toEqual(["navigator-profile", userId]);
    expect(navigatorQueryKey(userId)).not.toEqual(navigatorQueryKey(otherUser));
    expect(navigatorDraftKey(userId)).toEqual(["navigator-draft", userId]);
    expect(navigatorDraftKey(userId)).not.toEqual(navigatorDraftKey(otherUser));
    expect(navigatorDraftKey(userId)).not.toEqual(navigatorQueryKey(userId));
    expect(navigatorQueryKey(userId).join(":")).not.toContain("workspace");
  });
  it.each([
    [undefined, false, "loading"],
    [undefined, true, "error"],
    [null, false, "ready"],
    [null, true, "stale"],
    [profile(), false, "ready"],
    [profile(), true, "stale"],
  ] as const)(
    "does not confuse read state %j/%s with confirmed absence",
    (data, isError, expected) => {
      expect(navigatorReadState({ data, isError })).toBe(expected);
    },
  );
  it("requires a save for absence, an edited answer or explicitly migrating a legacy outline, not an unchanged native revision", () => {
    expect(navigatorNeedsSave(answers(), null)).toBe(true);
    expect(navigatorNeedsSave(answers(), legacy())).toBe(true);
    expect(navigatorNeedsSave(answers(), profile())).toBe(false);
    expect(
      navigatorNeedsSave(
        Object.fromEntries(Object.entries(answers()).reverse()) as ReturnType<typeof answers>,
        profile(),
      ),
    ).toBe(false);
    expect(navigatorNeedsSave(answers({ money_budget_monthly: 20 }), profile())).toBe(true);
  });
  it("uses the exact database version token and null only for an absent row", () => {
    expect(navigatorVersion(null)).toBeNull();
    const version = "2026-11-12T15:00:00.123456+00:00";
    expect(navigatorVersion(profile({ updated_at: version }))).toBe(version);
  });
  it.each(["pt-BR", "en-US"])(
    "renders UTC dates in São Paulo, not the host/browser timezone (%s)",
    (language) => {
      expect(navigatorDate(at, language)).toContain("12:00");
      expect(navigatorDate("2026-11-13T01:00:00Z", language)).toMatch(/12/);
      expect(navigatorDate("invalid", language)).toBeNull();
    },
  );
  it.each(["/app", "/app/brands", "/app/content?mode=draft#draft", "/app/channels"])(
    "keeps safe internal navigation %s",
    (href) => {
      expect(navigatorInternalHref(href)).toBe(href);
    },
  );
  it.each([
    null,
    undefined,
    {},
    "",
    "javascript:alert(1)",
    "data:text/html,x",
    "https://example.invalid/app",
    "//example.invalid/app",
    "/application",
    "/login",
    "/app/../login",
    "/app/brands bad",
    "/app\\evil",
    "/app/%2f%2fevil",
    "/app/%5cevil",
    "/app/%0aevil",
  ])("does not navigate an unsafe saved destination %j", (href) => {
    expect(navigatorInternalHref(href)).toBeNull();
  });
  it("shows a bounded legacy preview with its full readable count, without mutating or executing JSON", () => {
    const raw = Array.from({ length: 24 }, (_, n) => ({
      title: `Original ${n} <script>`,
      href: n % 2 ? "/app/brands" : "javascript:alert(1)",
    }));
    const result = legacyNavigatorActions([...raw, null, 3, {}, { title: " " }]);
    expect(result.total).toBe(24);
    expect(result.items).toHaveLength(20);
    expect(result.items[0].href).toBeNull();
    expect(result.items[1].href).toBe("/app/brands");
    expect(raw).toHaveLength(24);
    expect(legacyNavigatorActions({ title: "Not an action list" })).toEqual({
      items: [],
      total: 0,
    });
  });
});
