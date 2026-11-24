import { describe, expect, it } from "vitest";
import {
  SCORE_PILLARS,
  confirmDiagnosticRead,
  confirmHealth,
  confirmHealthReceipt,
  confirmSavedHealth,
  confirmSavedScore,
  confirmScore,
  confirmScoreReceipt,
  diagnosticComputeSchema,
  healthMethod,
  scoreMethod,
} from "../contracts";
import { at, healthRecords, id, input, otherWorkspace, scoreRecord, workspaceId } from "./fixtures";

describe("diagnostic transport contracts", () => {
  it.each([
    undefined,
    {},
    null,
    "",
    { workspaceId },
    { ...input, calculationId: "not-an-id" },
    { ...input, workspaceId: workspaceId + ",evil" },
  ])("rejects an unscoped/unidentified compute command %j", (value) => {
    expect(diagnosticComputeSchema.safeParse(value).success).toBe(false);
  });
  it("keeps successful score absence distinct from missing transport and health null", () => {
    expect(confirmDiagnosticRead("score", null, workspaceId)).toEqual({
      kind: "score",
      value: null,
    });
    expect(confirmDiagnosticRead("health", [], workspaceId)).toEqual({ kind: "health", value: [] });
    expect(() => confirmDiagnosticRead("score", undefined, workspaceId)).toThrow();
    expect(() => confirmDiagnosticRead("health", null, workspaceId)).toThrow();
  });
  it("preserves genuinely legacy saved text and zeros without upgrading its methodology", () => {
    const score = {
      ...scoreRecord(),
      overall: 0,
      breakdown: { gaps: ["Saved <script>text</script>"] },
    };
    expect(confirmScore(score, workspaceId).overall).toBe(0);
    expect(scoreMethod(score)).toBeNull();
    const health = healthRecords().map((row) => ({
      ...row,
      details: {},
      weaknesses: ["Original PT text"],
      score: 0,
    }));
    expect(confirmHealth(health, workspaceId)).toEqual(health);
    expect(healthMethod(health[0])).toBeNull();
  });
  it.each(["overall", ...SCORE_PILLARS])("does not coerce a malformed %s pillar to zero", (key) => {
    for (const bad of [null, undefined, -1, 101, 1.5, "0", NaN, Infinity])
      expect(() => confirmScore({ ...scoreRecord(), [key]: bad }, workspaceId)).toThrow();
  });
  it.each(["id", "workspace_id", "computed_at", "breakdown"])(
    "requires saved score field %s",
    (field) => {
      const value: Record<string, unknown> = { ...scoreRecord() };
      delete value[field];
      expect(() => confirmScore(value, workspaceId)).toThrow();
    },
  );
  it("rejects a foreign score before rendering", () => {
    expect(() =>
      confirmScore({ ...scoreRecord(), workspace_id: otherWorkspace }, workspaceId),
    ).toThrow("workspace");
  });
  it("rejects inconsistent calculation IDs or metadata timestamps", () => {
    expect(() => confirmScore({ ...scoreRecord(), id: id(200) }, workspaceId)).toThrow(
      "calculation",
    );
    expect(() =>
      confirmScore({ ...scoreRecord(), computed_at: "2026-11-12T14:00:00Z" }, workspaceId),
    ).toThrow("timestamp");
  });
  it("does not turn a malformed declared methodology into legacy history", () => {
    expect(() =>
      confirmScore({ ...scoreRecord(), breakdown: { diagnostic: null } }, workspaceId),
    ).toThrow();
    expect(() =>
      confirmHealth(
        [{ ...healthRecords()[0], details: { diagnostic: { model: "unknown" } } }],
        workspaceId,
      ),
    ).toThrow();
  });
  it("allows partial read history, never duplicate or unknown categories", () => {
    expect(confirmHealth([healthRecords()[2]], workspaceId)).toHaveLength(1);
    expect(() => confirmHealth([healthRecords()[0], healthRecords()[0]], workspaceId)).toThrow();
    expect(() =>
      confirmHealth([{ ...healthRecords()[0], category: "unknown" }], workspaceId),
    ).toThrow();
    expect(() =>
      confirmHealth([{ ...healthRecords()[0], workspace_id: otherWorkspace }], workspaceId),
    ).toThrow();
  });
  it("normalizes category order without losing zero values", () => {
    const rows = healthRecords().reverse();
    expect(confirmHealth(rows, workspaceId).map((row) => row.category)).toEqual([
      "marketing",
      "content",
      "brand",
      "channel",
      "growth",
    ]);
  });
  it("accepts only a complete primary score receipt, with independently reported secondary effects", () => {
    const receipt = { score: scoreRecord(), snapshotRecorded: false, answersInvalidated: false };
    expect(confirmScoreReceipt(receipt, input)).toEqual(receipt);
    for (const bad of [
      {},
      { score: scoreRecord() },
      { ...receipt, answersInvalidated: true },
      { ...receipt, score: { ...scoreRecord(), id: id(90) } },
    ])
      expect(() => confirmScoreReceipt(bad, input)).toThrow();
  });
  it("accepts confirmed five-area health only for the requested calculation", () => {
    expect(confirmHealthReceipt({ metrics: healthRecords() }, input).metrics).toHaveLength(5);
    expect(() => confirmHealthReceipt({ metrics: healthRecords().slice(1) }, input)).toThrow();
    expect(() =>
      confirmHealthReceipt({ metrics: healthRecords() }, { ...input, calculationId: id(200) }),
    ).toThrow();
  });
  it("checks the score persisted values, not just a non-null insert", () => {
    const expected = scoreRecord();
    expect(confirmSavedScore(expected, expected)).toEqual(expected);
    expect(() =>
      confirmSavedScore({ ...expected, overall: expected.overall + 1 }, expected),
    ).toThrow();
    expect(() => confirmSavedScore(null, expected)).toThrow();
  });
  it("compares each of the five persisted categories and their explanations", () => {
    const expected = healthRecords();
    expect(confirmSavedHealth([...expected].reverse(), expected)).toEqual(expected);
    for (const changes of [
      { score: 3 },
      { strengths: ["not sent"] },
      { weaknesses: ["not sent"] },
      { category: "brand" },
      { id: id(999) },
    ])
      expect(() =>
        confirmSavedHealth([{ ...expected[0], ...changes }, ...expected.slice(1)], expected),
      ).toThrow();
    expect(() => confirmSavedHealth(null, expected)).toThrow();
    expect(() => confirmSavedHealth(expected.slice(1), expected)).toThrow();
  });
  it("accepts equivalent timezone representations of the saved timestamp without losing the version data", () => {
    const expected = scoreRecord();
    const row = { ...expected, computed_at: "2026-11-12T12:00:00.123-03:00" };
    expect(confirmSavedScore(row, expected).computed_at).toBe(row.computed_at);
    expect(Date.parse(at)).toBe(Date.parse(row.computed_at));
  });
});

describe("health receipt evidence coherence", () => {
  it("rejects five rows with the same calculation ID/time but contradictory source metadata", () => {
    const metrics = healthRecords();
    const details = healthMethod(metrics[0])!;
    details.diagnostic.recentCreated = 0;
    metrics[0].details = details;
    expect(() => confirmHealthReceipt({ metrics }, input)).toThrow("receipt");
  });
});
