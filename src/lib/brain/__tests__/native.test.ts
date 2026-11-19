import { describe, expect, it } from "vitest";
import {
  BRAIN_MEMORY_KINDS,
  BRAIN_PREVIEW_LIMIT,
  brainMemoryInputSchema,
  effectiveBrainStatus,
  nativeBrainCount,
  nativeBrainRecommendations,
  nativeGenerationSchema,
  nativeMemoriesSchema,
  nativeMemorySchema,
  nativeRecommendationSchema,
  nativeRecommendationsSchema,
  nativeRuleCountsSchema,
  nativeStatusReceiptSchema,
  type NativeRecommendation,
} from "../native";
const at = "2026-11-12T15:00:00Z";
const id = "10000000-0000-4000-8000-000000000001";
const rec: NativeRecommendation = {
  id,
  kind: "test",
  title: "Saved text",
  rationale: null,
  score: 0,
  status: "open",
  expires_at: null,
  created_at: at,
};
const memory = { id, kind: "goal", content: "Saved text", created_at: at };
const established = { brands: 1, connectedChannels: 1, content: 12, drafts: 2, activeMissions: 1 };

describe("native Brain validation", () => {
  it.each(BRAIN_MEMORY_KINDS)("accepts and trims a %s memory", (kind) => {
    expect(brainMemoryInputSchema.parse({ kind, content: "  My goal  \n" })).toEqual({
      kind,
      content: "My goal",
    });
    expect(nativeMemorySchema.parse({ ...memory, kind }).kind).toBe(kind);
  });
  it.each(["", " ", "\n\t", "x", " x ", "x".repeat(4001)])(
    "rejects an invalid memory length: case %#",
    (content) => {
      expect(brainMemoryInputSchema.safeParse({ kind: "goal", content }).success).toBe(false);
    },
  );
  it("accepts the exact normalized lower/upper bounds and rejects an unknown kind", () => {
    expect(brainMemoryInputSchema.parse({ kind: "fact", content: "  hi  " }).content).toBe("hi");
    expect(
      brainMemoryInputSchema.parse({ kind: "fact", content: "x".repeat(4000) }).content,
    ).toHaveLength(4000);
    expect(brainMemoryInputSchema.safeParse({ kind: "other", content: "Hi" }).success).toBe(false);
  });
  it.each([null, undefined, -1, 0.5, NaN, Infinity, "0", Number.MAX_SAFE_INTEGER + 1])(
    "never turns an invalid exact count into zero: %#",
    (value) => {
      expect(() => nativeBrainCount(value)).toThrow();
    },
  );
  it.each([0, 1, 1205, Number.MAX_SAFE_INTEGER])("keeps confirmed count %s", (value) => {
    expect(nativeBrainCount(value)).toBe(value);
  });
  it.each([nativeRecommendationsSchema, nativeMemoriesSchema])(
    "only accepts a complete first preview matching min(total, 50)",
    (schema) => {
      const item = schema === nativeRecommendationsSchema ? rec : memory;
      expect(schema.safeParse({ items: [], total: 0, limit: 50, checkedAt: at }).success).toBe(
        true,
      );
      expect(schema.safeParse({ items: [item], total: 1, limit: 50, checkedAt: at }).success).toBe(
        true,
      );
      expect(
        schema.safeParse({
          items: Array.from({ length: 50 }, () => item),
          total: 1205,
          limit: 50,
          checkedAt: at,
        }).success,
      ).toBe(true);
      for (const invalid of [
        { items: null, total: 0 },
        { items: [], total: 1 },
        { items: [item], total: 0 },
        { items: [item], total: null },
        { items: [item], total: 1205 },
        { items: Array.from({ length: 51 }, () => item), total: 51 },
      ])
        expect(
          schema.safeParse({ limit: BRAIN_PREVIEW_LIMIT, checkedAt: at, ...invalid }).success,
        ).toBe(false);
    },
  );
  it.each([
    { score: -0.01 },
    { score: 1.01 },
    { score: "0.5" },
    { score: NaN },
    { status: "unknown" },
    { expires_at: "not-a-date" },
    { created_at: "2026-11-12" },
    { id: "not-uuid" },
  ])("rejects malformed saved recommendation: %#", (patch) => {
    expect(nativeRecommendationSchema.safeParse({ ...rec, ...patch }).success).toBe(false);
  });
  it.each([0, 1])("keeps valid priority boundary %s", (score) => {
    expect(nativeRecommendationSchema.parse({ ...rec, score }).score).toBe(score);
  });
  it.each([
    [null, "open"],
    ["2026-11-12T15:00:00.001Z", "open"],
    [at, "expired"],
    ["2026-11-12T14:59:59Z", "expired"],
  ])("derives open expiration at the confirmed reading: %s", (expires_at, expected) => {
    expect(effectiveBrainStatus({ ...rec, expires_at }, at)).toBe(expected);
  });
  it.each(["applied", "dismissed", "expired"] as const)(
    "never overwrites stored %s with date-derived expiry",
    (status) => {
      expect(effectiveBrainStatus({ ...rec, status, expires_at: at }, at)).toBe(status);
    },
  );
  it("requires explicit main-write receipts rather than an empty HTTP success", () => {
    expect(nativeGenerationSchema.safeParse({}).success).toBe(false);
    expect(nativeStatusReceiptSchema.safeParse({ ok: true }).success).toBe(false);
    expect(nativeMemorySchema.safeParse(null).success).toBe(false);
    expect(nativeGenerationSchema.parse({ generated: 0, eventRecorded: false })).toEqual({
      generated: 0,
      eventRecorded: false,
    });
  });
});

describe.each(["pt-BR", "en-US"] as const)("native rules in %s", (language) => {
  it("does not create recommendations when no rule is met", () => {
    expect(nativeBrainRecommendations(established, language)).toEqual([]);
  });
  it("prioritizes brand/content and labels a single channel connection optional", () => {
    const recs = nativeBrainRecommendations(
      { brands: 0, content: 0, drafts: 0, connectedChannels: 0, activeMissions: 0 },
      language,
    );
    expect(recs.map((r) => r.kind)).toEqual([
      "setup.brand",
      "ops.create",
      "growth.mission",
      "setup.channel",
    ]);
    expect(recs.at(-1)?.payload.optional).toBe(true);
    expect(recs.filter((r) => r.kind === "setup.channel")).toHaveLength(1);
    expect(recs.map((r) => r.score)).toEqual([...recs.map((r) => r.score)].sort((a, b) => b - a));
  });
  it("keeps real large draft counts rather than a truncated 500-row sample", () => {
    const recs = nativeBrainRecommendations(
      { ...established, content: 5000, drafts: 3724 },
      language,
    );
    expect(recs).toHaveLength(1);
    expect(recs[0].title).toContain(new Intl.NumberFormat(language).format(3724));
    expect(recs[0].payload.action).toBe("open_scheduler");
  });
  it("uses the exact threshold and active missions include in-progress work", () => {
    expect(nativeBrainRecommendations({ ...established, drafts: 2 }, language)).toEqual([]);
    expect(
      nativeBrainRecommendations({ ...established, drafts: 3 }, language).map((r) => r.kind),
    ).toEqual(["ops.publish"]);
    expect(
      nativeBrainRecommendations({ ...established, activeMissions: 0 }, language).map(
        (r) => r.kind,
      ),
    ).toEqual(["growth.mission"]);
  });
  it("does not mutate input and is deterministic for confirmed counts", () => {
    const input = Object.freeze({ ...established, brands: 0 });
    expect(nativeBrainRecommendations(input, language)).toEqual(
      nativeBrainRecommendations(input, language),
    );
    expect(input.brands).toBe(0);
  });
});
it("rejects inconsistent count readings before generation", () => {
  expect(nativeRuleCountsSchema.safeParse({ ...established, content: 1, drafts: 2 }).success).toBe(
    false,
  );
  expect(() => nativeBrainRecommendations({ ...established, brands: -1 }, "pt-BR")).toThrow();
});
