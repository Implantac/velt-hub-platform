import { afterEach, describe, expect, it } from "vitest";
import {
  diagnosticDate,
  diagnosticQueryKey,
  canReadDiagnostics,
  feedbackAfterDiagnosticRead,
  healthHistory,
} from "../presentation";
import { healthRecords, id, input, scoreRecord } from "@/lib/diagnostics/__tests__/fixtures";
import { confirmScore, healthMethod, scoreMethod } from "@/lib/diagnostics/contracts";

const originalZone = process.env.TZ;
afterEach(() => {
  if (originalZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalZone;
});
describe("diagnostic presentation contracts", () => {
  it.each(["owner", "admin", "editor", "viewer"])("allows recognized %s read access", (role) => {
    expect(canReadDiagnostics(role)).toBe(true);
  });
  it.each([undefined, null, "", "OWNER", "unknown"])("denies unrecognized role %s", (role) => {
    expect(canReadDiagnostics(role)).toBe(false);
  });
  it("isolates query keys by module, user and workspace", () => {
    const keys = [
      diagnosticQueryKey("score", id(1), id(2)),
      diagnosticQueryKey("health", id(1), id(2)),
      diagnosticQueryKey("score", id(3), id(2)),
      diagnosticQueryKey("score", id(1), id(4)),
    ];
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(4);
    expect(keys[0]).toEqual(["diagnostics", id(1), id(2), "score"]);
  });
  it.each(["pt-BR", "en-US"])(
    "uses São Paulo dates even when the runner is in Tokyo (%s)",
    (language) => {
      process.env.TZ = "Asia/Tokyo";
      const value = diagnosticDate("2026-11-13T01:30:00Z", language);
      expect(value).toMatch(/12/);
      expect(value).toMatch(language === "pt-BR" ? /22:30/ : /10:30/);
      expect(diagnosticDate("invalid", language)).toBeNull();
    },
  );
  it("does not erase a confirmed primary save or its secondary warnings after GET recovery", () => {
    expect(
      feedbackAfterDiagnosticRead(
        { kind: "saved", readFailed: true, snapshotMissing: true, answersStale: true },
        true,
      ),
    ).toEqual({ kind: "saved", readFailed: false, snapshotMissing: true, answersStale: true });
    expect(feedbackAfterDiagnosticRead({ kind: "saved" }, false)).toEqual({
      kind: "saved",
      readFailed: true,
    });
  });
  it("does not turn an uncertain write into success merely because history can be read", () => {
    expect(feedbackAfterDiagnosticRead({ kind: "unconfirmed" }, true)).toEqual({
      kind: "unconfirmed",
    });
    expect(feedbackAfterDiagnosticRead(null, false)).toBeNull();
    expect(feedbackAfterDiagnosticRead(null, true)).toEqual({ kind: "refreshed" });
  });
  it("reports missing areas without creating zero-valued placeholders", () => {
    const value = healthHistory(healthRecords().slice(1));
    expect(value.missing).toEqual(["marketing"]);
    expect(value.mixed).toBe(false);
    expect(value.commonMethod?.calculationId).toBe(input.calculationId);
  });
  it("only calls a history a common methodology when all returned evidence is identical", () => {
    const rows = healthRecords();
    const method = healthMethod(rows[0])!;
    rows[0].details = { ...method, diagnostic: { ...method.diagnostic, calculationId: id(900) } };
    const value = healthHistory(rows);
    expect(value.mixed).toBe(true);
    expect(value.commonMethod).toBeNull();
  });
  it("does not mislabel a legacy or mixed legacy/new history as v2", () => {
    const rows = healthRecords();
    rows[0].details = {};
    expect(healthHistory(rows)).toMatchObject({ mixed: true, legacy: true, commonMethod: null });
    expect(healthHistory(rows.map((row) => ({ ...row, details: {} })))).toMatchObject({
      legacy: true,
      commonMethod: null,
    });
  });
  it("checks internally recorded v2 pillars against evidence instead of accepting contradictory metadata", () => {
    const row = scoreRecord();
    const method = scoreMethod(row)!;
    expect(() =>
      confirmScore(
        {
          ...row,
          breakdown: { ...method, diagnostic: { ...method.diagnostic, recentCreated: 0 } },
        },
        row.workspace_id,
      ),
    ).toThrow("methodology");
  });
});
