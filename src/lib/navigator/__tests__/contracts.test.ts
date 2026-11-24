import { describe, expect, it } from "vitest";
import {
  confirmNavigatorProfile,
  confirmNavigatorReceipt,
  nativeNavigatorPlan,
  navigatorAnswers,
  navigatorAnswersEqual,
  navigatorAnswersSchema,
  navigatorSameInstant,
  navigatorSaveInputSchema,
} from "../contracts";
import { navigatorProfilePayload } from "../model";
import {
  answers,
  at,
  earlier,
  input,
  later,
  legacy,
  otherRevision,
  otherUser,
  profile,
  revisionId,
  userId,
} from "./fixtures";

describe("Navigator complete explicit save contract", () => {
  it("requires an explicit nullable version and revision reference; has no hidden defaults", () => {
    expect(navigatorSaveInputSchema.parse(input())).toEqual(input());
    for (const key of ["answers", "expectedUpdatedAt", "revisionId"] as const) {
      const value = { ...input() } as Record<string, unknown>;
      delete value[key];
      expect(navigatorSaveInputSchema.safeParse(value).success).toBe(false);
    }
    for (const key of Object.keys(answers())) {
      const value = { ...answers() } as Record<string, unknown>;
      delete value[key];
      expect(navigatorAnswersSchema.safeParse(value).success).toBe(false);
    }
  });
  it.each([
    "workspaceId",
    "user_id",
    "onboarding_completed",
    "maturity_level",
    "recommended_actions",
    "force",
    "retry",
  ])("rejects extra caller-controlled %s before any domain work", (key) => {
    expect(navigatorSaveInputSchema.safeParse({ ...input(), [key]: true }).success).toBe(false);
    expect(navigatorAnswersSchema.safeParse({ ...answers(), [key]: true }).success).toBe(false);
  });
  it.each([undefined, "", "bad", "2026-11-12", "2026-02-30T15:00:00Z", 42])(
    "rejects a malformed expected version %s",
    (expectedUpdatedAt) => {
      expect(navigatorSaveInputSchema.safeParse({ ...input(), expectedUpdatedAt }).success).toBe(
        false,
      );
    },
  );
  it("keeps a precise Postgres version intact rather than rounding it for the compare-and-swap", () => {
    const value = "2026-11-12T15:00:00.123456+00:00";
    expect(
      navigatorSaveInputSchema.parse(input({ expectedUpdatedAt: value })).expectedUpdatedAt,
    ).toBe(value);
  });
  it.each([null, "", "revision-21", "https://example.invalid", 1])(
    "rejects invalid revision ID %s",
    (value) => {
      expect(navigatorSaveInputSchema.safeParse({ ...input(), revisionId: value }).success).toBe(
        false,
      );
    },
  );
  it.each([-1, 169, 0.5, NaN, Infinity, "5", null])(
    "rejects invalid hours %s without clamping",
    (value) => {
      expect(
        navigatorAnswersSchema.safeParse({ ...answers(), time_budget_hours_week: value }).success,
      ).toBe(false);
    },
  );
  it.each([-1, 1000000.01, 0.001, NaN, Infinity, "0", null])(
    "rejects invalid budget %s without coercion",
    (value) => {
      expect(
        navigatorAnswersSchema.safeParse({ ...answers(), money_budget_monthly: value }).success,
      ).toBe(false);
    },
  );
  it.each([0, 0.29, 10000.01, 900000.45, 1000000])(
    "accepts the complete currency range, including %s",
    (value) => {
      expect(
        navigatorAnswersSchema.parse(answers({ money_budget_monthly: value })).money_budget_monthly,
      ).toBe(value);
    },
  );
  it("accepts zero/full hours, nullable activity and genuinely optional empty lists", () => {
    for (const hours of [0, 168])
      expect(
        navigatorAnswersSchema.parse(
          answers({
            time_budget_hours_week: hours,
            business_path: null,
            goals: [],
            preferred_channels: [],
            content_preferences: [],
          }),
        ),
      ).toMatchObject({ time_budget_hours_week: hours, business_path: null, goals: [] });
  });
  it.each(["goals", "preferred_channels", "content_preferences"] as const)(
    "trims and deduplicates %s only in an explicit input parse, preserving order and original data",
    (key) => {
      const raw = answers({ [key]: [" Custom ", "Custom", "Other", "Other"] });
      const snapshot = structuredClone(raw),
        parsed = navigatorAnswersSchema.parse(raw);
      expect(parsed[key]).toEqual(["Custom", "Other"]);
      expect(raw).toEqual(snapshot);
    },
  );
  it.each([
    ["goals", 80, 12],
    ["preferred_channels", 40, 20],
    ["content_preferences", 40, 20],
  ] as const)("bounds %s without silently dropping an earlier choice", (key, length, maximum) => {
    expect(navigatorAnswersSchema.safeParse(answers({ [key]: [" "] })).success).toBe(false);
    expect(
      navigatorAnswersSchema.safeParse(answers({ [key]: ["x".repeat(length + 1)] })).success,
    ).toBe(false);
    expect(
      navigatorAnswersSchema.safeParse(
        answers({ [key]: Array.from({ length: maximum + 1 }, (_, n) => `choice-${n}`) }),
      ).success,
    ).toBe(false);
    expect(navigatorAnswersSchema.safeParse(answers({ [key]: ["x".repeat(length)] })).success).toBe(
      true,
    );
  });
  it.each([
    { experience_level: "expert" },
    { business_path: "other" },
    { business_path: undefined },
    { goals: null },
    { preferred_channels: "Instagram" },
  ])("rejects an invalid enum/collection: %j", (patch) => {
    expect(navigatorAnswersSchema.safeParse({ ...answers(), ...patch }).success).toBe(false);
  });
  it("compares answers structurally, independent of JSON object key order but not selection order", () => {
    const normal = answers({ goals: ["A", "B"] });
    const reordered = Object.fromEntries(Object.entries(normal).reverse()) as typeof normal;
    expect(navigatorAnswersEqual(normal, reordered)).toBe(true);
    expect(navigatorAnswersEqual(normal, { ...normal, goals: ["B", "A"] })).toBe(false);
    expect(navigatorAnswers(normal)).not.toBe(normal);
  });
});

describe("Navigator personal read boundary", () => {
  it("treats exact null as absence, not undefined, an empty object or a malformed row", () => {
    expect(confirmNavigatorProfile(null, userId)).toBeNull();
    for (const value of [undefined, {}, [], { user_id: userId }])
      expect(() => confirmNavigatorProfile(value, userId)).toThrow();
  });
  it("verifies account ownership, never deriving it from workspace membership", () => {
    expect(() => confirmNavigatorProfile(profile({ user_id: otherUser }), userId)).toThrow("owner");
    expect(confirmNavigatorProfile(profile(), userId)?.user_id).toBe(userId);
  });
  it("preserves legacy strings, duplicates and numerical values on read without converting them to new rules", () => {
    const row = legacy({
      goals: [" Custom ", " Custom "],
      time_budget_hours_week: 120,
      money_budget_monthly: 900000.45,
      preferred_channels: ["Earlier network"],
      content_preferences: ["Earlier format"],
    });
    expect(confirmNavigatorProfile(row, userId)).toEqual(row);
    expect(nativeNavigatorPlan(row)).toBeNull();
    expect(
      confirmNavigatorProfile(
        legacy({ time_budget_hours_week: 200, money_budget_monthly: -1 }),
        userId,
      ),
    ).toMatchObject({ time_budget_hours_week: 200, money_budget_monthly: -1 });
  });
  it.each([null, [], {}, "Earlier outline", [{ title: "Earlier action" }]])(
    "keeps unmarked JSON as legacy, not native evidence: %j",
    (recommended_actions) => {
      expect(nativeNavigatorPlan(legacy({ recommended_actions }))).toBeNull();
    },
  );
  it("verifies native rules and keeps metadata timestamps equivalent across Postgres offset serialization", () => {
    const row = profile({ completed_at: "2026-11-12T15:00:00+00:00" });
    expect(confirmNavigatorProfile(row, userId)).toEqual(row);
    expect(nativeNavigatorPlan(row)).toMatchObject({
      model: "velt-navigator-v2",
      revisionId,
      savedAt: at,
    });
  });
  it.each(["created_at", "updated_at", "completed_at"] as const)(
    "does not present a malformed %s as a valid date",
    (key) => {
      expect(() =>
        confirmNavigatorProfile({ ...profile(), [key]: "not-a-date" }, userId),
      ).toThrow();
    },
  );
  const changes = [
    [
      "foreign model",
      (r: ReturnType<typeof profile>) => {
        const m = nativeNavigatorPlan(r)!;
        m.actions[0].navigator.model = "future-model" as "velt-navigator-v2";
        return { ...r, recommended_actions: m.actions };
      },
    ],
    [
      "mixed revisions",
      (r: ReturnType<typeof profile>) => {
        const m = nativeNavigatorPlan(r)!;
        m.actions[1].navigator.revisionId = otherRevision;
        return { ...r, recommended_actions: m.actions };
      },
    ],
    [
      "mixed dates",
      (r: ReturnType<typeof profile>) => {
        const m = nativeNavigatorPlan(r)!;
        m.actions[1].navigator.savedAt = later;
        return { ...r, recommended_actions: m.actions };
      },
    ],
    [
      "unsafe href",
      (r: ReturnType<typeof profile>) => {
        const m = nativeNavigatorPlan(r)!;
        m.actions[0].href = "javascript:alert(1)";
        return { ...r, recommended_actions: m.actions };
      },
    ],
    [
      "rewritten title",
      (r: ReturnType<typeof profile>) => {
        const m = nativeNavigatorPlan(r)!;
        m.actions[0].title = "Guaranteed revenue";
        return { ...r, recommended_actions: m.actions };
      },
    ],
    [
      "wrong order",
      (r: ReturnType<typeof profile>) => ({
        ...r,
        recommended_actions: nativeNavigatorPlan(r)!.actions.reverse(),
      }),
    ],
    [
      "incomplete actions",
      (r: ReturnType<typeof profile>) => ({
        ...r,
        recommended_actions: nativeNavigatorPlan(r)!.actions.slice(0, 3),
      }),
    ],
    [
      "unmarked action mixed into native",
      (r: ReturnType<typeof profile>) => ({
        ...r,
        recommended_actions: [
          ...nativeNavigatorPlan(r)!.actions.slice(0, 3),
          { title: "Other", href: "/app" },
        ],
      }),
    ],
    [
      "wrong enum",
      (r: ReturnType<typeof profile>) => ({ ...r, maturity_level: "scaling" as const }),
    ],
    ["unfinished", (r: ReturnType<typeof profile>) => ({ ...r, completed_at: null })],
    ["completion mismatch", (r: ReturnType<typeof profile>) => ({ ...r, completed_at: later })],
    ["answers not normalized", (r: ReturnType<typeof profile>) => ({ ...r, goals: [" Custom "] })],
    [
      "out-of-range native numbers",
      (r: ReturnType<typeof profile>) => ({ ...r, time_budget_hours_week: 200 }),
    ],
    [
      "malformed reserved namespace",
      (r: ReturnType<typeof profile>) => ({ ...r, recommended_actions: { navigator: null } }),
    ],
  ] as const;
  it.each(changes)("fails closed rather than falling back to legacy for %s", (_, change) => {
    expect(() => confirmNavigatorProfile(change(profile()), userId)).toThrow();
  });
});

describe("Navigator receipt confirmation", () => {
  it("checks the complete created revision and accepts canonical key order differences", () => {
    const request = input({
      answers: Object.fromEntries(Object.entries(answers()).reverse()) as ReturnType<
        typeof answers
      >,
    });
    expect(
      confirmNavigatorReceipt({ profile: profile(), mode: "created" }, request, userId, at).mode,
    ).toBe("created");
  });
  it("checks update mode, answers, owner and a new exact version, keeping the original creation time", () => {
    const row = profile({ created_at: earlier, updated_at: later });
    expect(
      confirmNavigatorReceipt(
        { profile: row, mode: "updated" },
        input({ expectedUpdatedAt: earlier }),
        userId,
        at,
      ).profile.created_at,
    ).toBe(earlier);
  });
  it.each([
    "experience_level",
    "business_path",
    "goals",
    "time_budget_hours_week",
    "money_budget_monthly",
    "preferred_channels",
    "content_preferences",
  ] as const)("does not accept a receipt for other %s, even if suggestions would match", (key) => {
    const alternative = answers({
      experience_level: "advanced",
      business_path: "freelancer",
      goals: ["Other goal"],
      time_budget_hours_week: 120,
      money_budget_monthly: 900000.45,
      preferred_channels: ["YouTube"],
      content_preferences: ["Newsletter"],
    });
    const row = profile({}, { [key]: alternative[key] });
    expect(() =>
      confirmNavigatorReceipt({ profile: row, mode: "created" }, input(), userId),
    ).toThrow();
  });
  it.each([
    ["missing profile", { mode: "created" }],
    ["no returned row", { profile: null, mode: "created" }],
    ["foreign owner", { profile: profile({ user_id: otherUser }), mode: "created" }],
    ["wrong operation mode", { profile: profile(), mode: "updated" }],
    ["legacy response", { profile: legacy(), mode: "created" }],
    ["changed creation timestamp", { profile: profile({ created_at: earlier }), mode: "created" }],
    ["extra envelope field", { profile: profile(), mode: "created", onboarding_completed: true }],
    [
      "foreign revision",
      {
        profile: profile({ ...navigatorProfilePayload(answers(), otherRevision, at) }),
        mode: "created",
      },
    ],
  ])("rejects %s without treating a resolved request as success", (_, value) => {
    expect(() => confirmNavigatorReceipt(value, input(), userId)).toThrow();
  });
  it("rejects an update that did not advance the exact version token", () => {
    expect(() =>
      confirmNavigatorReceipt(
        { profile: profile(), mode: "updated" },
        input({ expectedUpdatedAt: at }),
        userId,
      ),
    ).toThrow();
  });
  it("server confirmation also binds the saved timestamp to this invocation", () => {
    const row = profile({
      ...navigatorProfilePayload(answers(), revisionId, later),
      created_at: later,
      updated_at: later,
    });
    expect(() =>
      confirmNavigatorReceipt({ profile: row, mode: "created" }, input(), userId, at),
    ).toThrow();
  });
});

describe("Navigator timestamp precision", () => {
  it.each([
    ["2026-11-12T15:00:00.1Z", "2026-11-12T15:00:00.100000+00:00", true],
    ["2026-11-12T12:00:00-03:00", "2026-11-12T15:00:00.000Z", true],
    ["2026-11-12T15:00:00.123456+00:00", "2026-11-12T15:00:00.123457Z", false],
    ["not-a-date", "not-a-date", false],
  ] as const)("compares %s and %s without rounding sub-milliseconds", (a, b, expected) => {
    expect(navigatorSameInstant(a, b)).toBe(expected);
  });
  it("rejects a native completion timestamp tampered within one millisecond", () => {
    expect(() =>
      confirmNavigatorProfile(
        profile({ completed_at: "2026-11-12T15:00:00.000001+00:00" }),
        userId,
      ),
    ).toThrow();
  });
  it("rejects an unchanged update token expressed with another equivalent timezone/precision", () => {
    const row = profile({ updated_at: "2026-11-12T15:00:00.000000+00:00" });
    expect(() =>
      confirmNavigatorReceipt(
        { profile: row, mode: "updated" },
        input({ expectedUpdatedAt: at }),
        userId,
      ),
    ).toThrow();
  });
  it("accepts a genuinely new Postgres version within the same JavaScript millisecond", () => {
    const row = profile({ updated_at: "2026-11-12T15:00:00.123457+00:00" });
    expect(
      confirmNavigatorReceipt(
        { profile: row, mode: "updated" },
        input({ expectedUpdatedAt: "2026-11-12T15:00:00.123456+00:00" }),
        userId,
      ).profile.updated_at,
    ).toBe(row.updated_at);
  });
});
