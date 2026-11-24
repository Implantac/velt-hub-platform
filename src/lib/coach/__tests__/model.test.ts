import { describe, expect, it } from "vitest";
import { calculateDiagnostics } from "@/lib/diagnostics/model";
import { calculation } from "@/lib/diagnostics/__tests__/fixtures";
import { type DiagnosticMessage } from "@/lib/diagnostics/contracts";
import { COACH_RULE_CODES, COACH_RULES, coachMethod } from "../contracts";
import { coachRecommendations } from "../model";
import { at, evidence, id, input, userId, workspaceId } from "./fixtures";

describe("additive explainable Coach model", () => {
  it.each(COACH_RULE_CODES)(
    "encodes %s as a bounded explicit local rule with unchanged evidence",
    (code) => {
      const c = calculation();
      if (code === "brandMissing")
        c.diagnostic.sources.brands = { loaded: 0, total: 0, limit: 500 };
      if (code === "channelMissing")
        c.diagnostic.sources.channels = { loaded: 0, total: 0, limit: 500 };
      if (code === "queueNoEvidence")
        c.diagnostic.jobEvidence = { successes: 0, failures: 0, excluded: 3 };
      if (code === "reviewBaseline") {
        c.diagnostic.sources.content = { loaded: 9, total: 9, limit: 500 };
        c.diagnostic.recentCreated = 6;
        c.diagnostic.jobEvidence = { successes: 3, failures: 0, excluded: 0 };
      }
      const original = structuredClone(c);
      const values = {
        ...c,
        gapCodes: code === "reviewBaseline" ? [] : [code as DiagnosticMessage],
      };
      const rows = coachRecommendations(values, input, userId, () => id(100));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        workspace_id: workspaceId,
        user_id: userId,
        title: COACH_RULES[code].title,
        body: COACH_RULES[code].body,
        completed_at: null,
        dismissed_at: null,
        created_at: at,
        updated_at: at,
      });
      expect(coachMethod(rows[0])?.coach).toEqual({
        model: "velt-coach-v2",
        code,
        evidence: c.diagnostic,
      });
      expect(c).toEqual(original);
    },
  );
  it("derives only real diagnostic gap codes and unique IDs in the common four-source case", () => {
    let next = 100;
    const rows = coachRecommendations(calculation(), input, userId, () => id(next++));
    expect(rows.map((row) => coachMethod(row)?.coach.code)).toEqual([
      "channelDisconnected",
      "inventoryLow",
      "activityLow",
      "queueFailures",
    ]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  });
  it("uses absence only after all four empty sources are counted and confirmed", () => {
    const source = { data: [], count: 0, error: null };
    const c = calculateDiagnostics(
      { brands: source, channels: source, content: source, jobs: source },
      { workspaceId, calculationId: input.batchId },
      at,
      at,
    );
    let next = 100;
    const rows = coachRecommendations(c, input, userId, () => id(next++));
    expect(rows.map((row) => coachMethod(row)?.coach.code)).toEqual([
      "brandMissing",
      "channelMissing",
      "inventoryLow",
      "activityLow",
      "queueNoEvidence",
    ]);
    expect(rows.map((row) => row.body).join(" ")).not.toMatch(
      /3x|60%|Tudo em ordem|garante vendas/,
    );
  });
  it("preserves a partial 500 of 1205 source instead of presenting the slice as a workspace total", () => {
    const e = evidence();
    e.content = {
      data: Array.from({ length: 500 }, (_, i) => ({
        id: id(i + 1000),
        workspace_id: workspaceId,
        created_at: at,
      })),
      count: 1205,
      error: null,
    };
    const c = calculateDiagnostics(e, { workspaceId, calculationId: input.batchId }, at, at);
    let next = 100;
    expect(
      coachMethod(coachRecommendations(c, input, userId, () => id(next++))[0])?.coach.evidence
        .sources.content,
    ).toEqual({ loaded: 500, total: 1205, limit: 500 });
  });
  it.each(["brands", "channels", "content", "jobs"] as const)(
    "will not construct suggestions from an unavailable %s source",
    (name) => {
      const e = evidence();
      e[name] = { data: null, count: null, error: { message: "failed" } };
      expect(() =>
        calculateDiagnostics(e, { workspaceId, calculationId: input.batchId }, at, at),
      ).toThrow();
    },
  );
  it("rejects a different evidence batch before assigning any IDs", () => {
    let assigned = 0;
    expect(() =>
      coachRecommendations(calculation(), { ...input, batchId: id(999) }, userId, () => {
        assigned++;
        return id(100);
      }),
    ).toThrow("different batch");
    expect(assigned).toBe(0);
  });
  it("rejects duplicate codes rather than inflating recommendation count", () => {
    expect(() =>
      coachRecommendations(
        { ...calculation(), gapCodes: ["activityLow", "activityLow"] },
        input,
        userId,
        () => id(100),
      ),
    ).toThrow("Duplicate Coach rule");
  });
  it("rejects duplicate recommendation IDs before an insert can be attempted", () => {
    expect(() => coachRecommendations(calculation(), input, userId, () => id(100))).toThrow(
      "Duplicate Coach recommendation ID",
    );
  });
  it("does not turn an unexpected positive/unknown rule into a legacy fallback", () => {
    expect(() =>
      coachRecommendations({ ...calculation(), gapCodes: ["brandReady"] }, input, userId, () =>
        id(100),
      ),
    ).toThrow();
  });
});
