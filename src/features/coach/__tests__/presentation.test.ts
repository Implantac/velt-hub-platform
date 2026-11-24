import { describe, expect, it } from "vitest";
import {
  coachPageRange,
  coachQueryKey,
  coachQueryRoot,
  canReadCoach,
  coachDate,
  coachFeedbackAfterRead,
  coachReadState,
  nativeCoachJourney,
} from "../presentation";
import { COACH_MAX_PAGE } from "@/lib/coach/contracts";
import { at, input, journey, page, userId, workspaceId } from "@/lib/coach/__tests__/fixtures";

describe("Coach presentation boundaries", () => {
  it.each(["owner", "admin", "editor", "viewer"])("allows %s to read", (role) => {
    expect(canReadCoach(role)).toBe(true);
  });
  it.each([null, undefined, "", "unknown", "service_role"])("fails closed for %s", (role) => {
    expect(canReadCoach(role)).toBe(false);
  });
  it("isolates every user, workspace, panel, filter and page in the query key", () => {
    const key = coachQueryKey(workspaceId, userId, "recommendations", 1, "open");
    expect(key.slice(0, 3)).toEqual(coachQueryRoot(workspaceId, userId));
    expect(key).not.toEqual(coachQueryKey(userId, userId, "recommendations", 1, "open"));
    expect(key).not.toEqual(coachQueryKey(workspaceId, workspaceId, "recommendations", 1, "open"));
    expect(key).not.toEqual(coachQueryKey(workspaceId, userId, "journey", 1));
    expect(key).not.toEqual(coachQueryKey(workspaceId, userId, "recommendations", 2, "open"));
    expect(key).not.toEqual(coachQueryKey(workspaceId, userId, "recommendations", 1, "all"));
  });
  it.each([
    [undefined, false, "loading"],
    [undefined, true, "error"],
    [page(), false, "ready"],
    [page(), true, "stale"],
  ] as const)("does not equate read state %# with emptiness", (data, isError, expected) => {
    expect(coachReadState({ data, isError })).toBe(expected);
  });
  it.each(["pt-BR", "en-US"])(
    "uses São Paulo rather than the process default in %s",
    (language) => {
      expect(coachDate(at, language)).toMatch(/12:00/);
      expect(coachDate("not-a-date", language)).toBeNull();
      expect(coachDate("2026-11-12T01:00:00Z", language)).toContain("11");
    },
  );
  it("calculates empty, partial, vanished and capped ranges without lowering the exact total", () => {
    expect(coachPageRange({ page: 1, total: 0, items: [] })).toMatchObject({
      start: 0,
      end: 0,
      pages: 1,
      outOfRange: false,
      hasNext: false,
    });
    expect(coachPageRange({ page: 3, total: 1205, items: Array(20) })).toMatchObject({
      start: 41,
      end: 60,
      pages: 61,
      hasPrevious: true,
      hasNext: true,
    });
    expect(coachPageRange({ page: 2, total: 3, items: [] })).toMatchObject({
      outOfRange: true,
      start: 0,
      end: 0,
    });
    expect(
      coachPageRange({ page: COACH_MAX_PAGE, total: COACH_MAX_PAGE * 20 + 1, items: Array(20) }),
    ).toMatchObject({ reachedPageLimit: true, hasNext: false });
  });
  it("only translates the matching native journey event, not arbitrary saved/AI payloads", () => {
    const event = journey(0, {
      kind: "signal",
      subject: "Coach registrou um novo lote de recomendações",
      payload: { source: "velt-coach-v2", batchId: input.batchId, count: 4 },
    });
    expect(nativeCoachJourney(event)).toMatchObject({ batchId: input.batchId, count: 4 });
    expect(nativeCoachJourney({ ...event, subject: "Legacy claim" })).toBeNull();
    expect(nativeCoachJourney({ ...event, kind: "result" })).toBeNull();
    expect(nativeCoachJourney({ ...event, payload: { source: "velt-coach-v2" } })).toBeNull();
  });
  it("keeps primary success and secondary warnings across a failed or successful read", () => {
    const saved = { kind: "generated" as const, generated: 4, eventMissing: true };
    expect(coachFeedbackAfterRead(saved, false)).toEqual({ ...saved, readFailed: true });
    expect(coachFeedbackAfterRead({ ...saved, readFailed: true }, true)).toEqual({
      ...saved,
      readFailed: false,
    });
    const unknown = { kind: "unconfirmed" as const, reference: input.batchId };
    expect(coachFeedbackAfterRead(unknown, true)).toBe(unknown);
    expect(coachFeedbackAfterRead(null, true)).toEqual({ kind: "refreshed" });
    expect(coachFeedbackAfterRead(null, false)).toBeNull();
  });
});
