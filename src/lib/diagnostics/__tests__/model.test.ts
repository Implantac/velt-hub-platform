import { describe, expect, it } from "vitest";
import { calculateDiagnostics, type DiagnosticEvidence } from "../model";
import { DIAGNOSTIC_LIMIT, HEALTH_CATEGORIES, diagnosticMetaSchema } from "../contracts";
import { at, baseRow, calculation, evidence, input, otherWorkspace } from "./fixtures";

const compute = (value: DiagnosticEvidence) => calculateDiagnostics(value, input, at, at);
const rows = (value: unknown[]) => ({ data: value, count: value.length, error: null });
const job = (changes: Record<string, unknown> = {}) => ({
  ...baseRow(80),
  status: "succeeded",
  external_post_id: "real",
  reconcile_state: "confirmed",
  scheduled_at: at,
  ...changes,
});

describe("versioned diagnostic calculation", () => {
  it("retains the six weights, exposes actual evidence and creates five ordered health categories", () => {
    const result = calculation();
    expect(result.scores).toEqual({
      overall: 58,
      presence: 100,
      branding: 100,
      content: 16,
      consistency: 24,
      growth: 50,
      channel_setup: 67,
    });
    expect(result.cards.map((card) => [card.category, card.score])).toEqual([
      ["marketing", 84],
      ["content", 20],
      ["brand", 100],
      ["channel", 67],
      ["growth", 50],
    ]);
    expect(result.diagnostic).toMatchObject({
      model: "velt-records-v2",
      calculationId: input.calculationId,
      recentCreated: 2,
      jobEvidence: { successes: 1, failures: 1, excluded: 1 },
    });
    expect(result.gapCodes).toEqual([
      "channelDisconnected",
      "inventoryLow",
      "activityLow",
      "queueFailures",
    ]);
  });
  it("allows confirmed empty sources but declares no queue evidence rather than measured failure", () => {
    const value = evidence();
    for (const name of Object.keys(value) as Array<keyof DiagnosticEvidence>)
      value[name] = rows([]);
    const result = compute(value);
    expect(Object.values(result.scores)).toEqual(Array(7).fill(0));
    expect(result.cards.map((card) => card.category)).toEqual(HEALTH_CATEGORIES);
    expect(result.gapCodes).toContain("queueNoEvidence");
    expect(result.cards.flatMap((card) => card.strengthCodes)).toEqual([]);
    expect(result.diagnostic.jobEvidence).toEqual({ successes: 0, failures: 0, excluded: 0 });
  });
  it.each([0, 1, 2, 3, 4, 13, 500])(
    "keeps bounded, integer pillar scores for %s inventory records",
    (size) => {
      const value = evidence();
      value.content = rows(
        Array.from({ length: size }, (_, index) => ({ ...baseRow(1000 + index), created_at: at })),
      );
      const result = compute(value);
      expect(result.scores.content).toBe(Math.min(100, size * 8));
      expect(result.scores.consistency).toBe(Math.min(100, size * 12));
      Object.values(result.scores).forEach((score) => {
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });
    },
  );
  it("distinguishes exact count 1205 from the analyzed 500, without extrapolation", () => {
    const value = evidence();
    value.content = {
      ...rows(
        Array.from({ length: 500 }, (_, index) => ({
          ...baseRow(1000 + index),
          created_at: "2026-09-01T00:00:00Z",
        })),
      ),
      count: 1205,
    };
    const result = compute(value);
    expect(result.diagnostic.sources.content).toEqual({ loaded: 500, total: 1205, limit: 500 });
    expect(result.diagnostic.recentCreated).toBe(0);
    expect(result.scores.consistency).toBe(0);
  });
  it.each([
    ["2026-10-13T15:00:00.123Z", 1],
    ["2026-10-13T15:00:00.122Z", 0],
    [at, 1],
    ["2026-11-12T15:00:00.124Z", 0],
    ["2099-01-01T00:00:00Z", 0],
  ])(
    "counts creation %s within the explicit 30-day window as %s, regardless of runner clock",
    (created_at, expected) => {
      const value = evidence();
      value.content = rows([{ ...baseRow(30), created_at }]);
      expect(compute(value).diagnostic.recentCreated).toBe(expected);
    },
  );
  it.each([{}, { tone: "" }, { tone: "  " }, { nested: { empty: [] } }, null])(
    "does not reward blank brand configuration %j",
    (voice) => {
      const value = evidence();
      value.brands = rows([{ ...baseRow(10), voice, palette: {}, logo_url: " " }]);
      expect(compute(value).scores.branding).toBe(0);
    },
  );
  it("averages brand completeness rather than counting a single configured brand twice", () => {
    const value = evidence();
    value.brands = rows([
      { ...baseRow(10), voice: { tone: "clear" }, palette: { colors: ["red"] }, logo_url: "logo" },
      { ...baseRow(11), voice: {}, palette: {}, logo_url: null },
    ]);
    expect(compute(value).scores.branding).toBe(50);
  });
  it.each([
    { status: "expired", authorization_issue: null, oauth_revoked_at: null },
    { status: "connected", authorization_issue: "reauth", oauth_revoked_at: null },
    { status: "connected", authorization_issue: null, oauth_revoked_at: at },
    { status: "error", authorization_issue: null, oauth_revoked_at: null },
  ])("does not label an unhealthy channel as connected %j", (channel) => {
    const value = evidence();
    value.channels = rows([{ ...baseRow(20), ...channel }]);
    expect(compute(value).scores.channel_setup).toBe(0);
    expect(compute(value).gapCodes).toContain("channelDisconnected");
  });
  it.each([
    { status: "pending" },
    { status: "processing" },
    { status: "cancelled" },
    { external_post_id: "sim_123" },
    { external_post_id: " SIM_123 " },
    { external_post_id: null },
    { external_post_id: "   " },
    { reconcile_state: "pending" },
    { reconcile_state: "review" },
    { reconcile_state: "closed" },
    { scheduled_at: "2099-01-01T00:00:00Z" },
    { status: "failed", reconcile_state: "confirmed" },
    { status: "dead_letter", external_post_id: "uncertain", reconcile_state: "none" },
  ])("does not turn excluded or uncertain job %j into success/failure evidence", (changes) => {
    const value = evidence();
    value.jobs = rows([job(changes)]);
    expect(compute(value).diagnostic.jobEvidence).toEqual({
      successes: 0,
      failures: 0,
      excluded: 1,
    });
    expect(compute(value).gapCodes).toContain("queueNoEvidence");
  });
  it.each(["failed", "dead_letter"])(
    "counts definitive %s without reference/reconciliation as a failure",
    (status) => {
      const value = evidence();
      value.jobs = rows([job({ status, external_post_id: null, reconcile_state: "none" })]);
      expect(compute(value).diagnostic.jobEvidence).toEqual({
        successes: 0,
        failures: 1,
        excluded: 0,
      });
      expect(compute(value).gapCodes).toContain("queueFailures");
    },
  );
  it.each(["none", "confirmed"])(
    "counts an internally recorded success with %s reconciliation, not external certification",
    (reconcile_state) => {
      const value = evidence();
      value.jobs = rows([job({ reconcile_state })]);
      expect(compute(value).scores.growth).toBe(100);
      expect(compute(value).diagnostic.jobEvidence).toEqual({
        successes: 1,
        failures: 0,
        excluded: 0,
      });
    },
  );
});

describe.each(["brands", "channels", "content", "jobs"] as const)(
  "strict %s diagnostic source",
  (name) => {
    it.each([
      { data: null, count: 0, error: null },
      { data: undefined, count: 0, error: null },
      { data: [], count: null, error: null },
      { data: [], count: undefined, error: null },
      { data: [], count: -1, error: null },
      { data: [], count: "0", error: null },
      { data: [], count: 0.5, error: null },
      { data: [], count: 0, error: { message: "unavailable" } },
      { data: [], count: 0 },
      { data: [], count: 1, error: null },
      { data: [], count: 1205, error: null },
    ])("rejects missing/failed/incomplete evidence %j rather than inventing zero", (result) => {
      const value = evidence();
      value[name] = result as unknown as DiagnosticEvidence[typeof name];
      expect(() => compute(value)).toThrow();
    });
    it("rejects a row from another workspace", () => {
      const value = evidence();
      const first = (value[name].data as Array<Record<string, unknown>>)[0];
      first.workspace_id = otherWorkspace;
      expect(() => compute(value)).toThrow("scope");
    });
    it("rejects duplicated row IDs", () => {
      const value = evidence();
      const first = (value[name].data as unknown[])[0];
      value[name] = rows([first, first]);
      expect(() => compute(value)).toThrow("scope");
    });
    it("rejects a short slice even when a count was returned", () => {
      const value = evidence();
      value[name].count = DIAGNOSTIC_LIMIT + 1;
      expect(() => compute(value)).toThrow("slice");
    });
  },
);

describe("diagnostic metadata chronology", () => {
  it("does not accept the end of a collection before its start", () => {
    expect(() => calculateDiagnostics(evidence(), input, at, "2026-11-12T14:00:00Z")).toThrow();
  });
  it("does not accept evidence totals that contradict the loaded jobs", () => {
    const meta = calculation().diagnostic;
    meta.jobEvidence.excluded++;
    expect(diagnosticMetaSchema.safeParse(meta).success).toBe(false);
  });
});

describe("malformed brand JSON is unavailable evidence, not a zero-filled identity", () => {
  it.each(["unstructured text", 42, true, [], ["red"]])(
    "rejects incompatible voice/palette shape %j",
    (bad) => {
      for (const field of ["voice", "palette"]) {
        const value = evidence();
        const row = (value.brands.data as Array<Record<string, unknown>>)[0];
        row[field] = bad;
        expect(() => compute(value)).toThrow();
      }
    },
  );
});
