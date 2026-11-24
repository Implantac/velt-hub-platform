import { describe, expect, it } from "vitest";
import { page } from "@/lib/missions/__tests__/fixtures";
import { MISSION_MAX_PAGE } from "@/lib/missions/contracts";
import {
  canReadMissions,
  missionDate,
  missionFeedbackAfterRead,
  missionLanguage,
  missionPageRange,
  missionReadState,
  missionsQueryKey,
  missionsQueryRoot,
} from "../presentation";

describe("mission read presentation", () => {
  it.each(["owner", "admin", "editor", "viewer"])("recognizes %s for reads", (role) =>
    expect(canReadMissions(role)).toBe(true),
  );
  it.each([null, undefined, "", "unknown", "service_role"])(
    "does not infer membership from %#",
    (role) => expect(canReadMissions(role)).toBe(false),
  );
  it("distinguishes loading, initial failure, cached failure and a confirmed empty read", () => {
    expect(missionReadState({ data: undefined, isError: false })).toBe("loading");
    expect(missionReadState({ data: undefined, isError: true })).toBe("error");
    expect(missionReadState({ data: page(), isError: true })).toBe("stale");
    expect(missionReadState({ data: page({ total: 0 }), isError: false })).toBe("ready");
  });
  it("isolates keys by workspace, identity, filter and page", () => {
    const key = missionsQueryKey("workspace", "user", "all", 1);
    expect(key).toEqual(["missions", "workspace", "user", "all", 1]);
    expect(key.slice(0, 3)).toEqual(missionsQueryRoot("workspace", "user"));
    for (const other of [
      missionsQueryKey("other", "user", "all", 1),
      missionsQueryKey("workspace", "other", "all", 1),
      missionsQueryKey("workspace", "user", "done", 1),
      missionsQueryKey("workspace", "user", "all", 2),
    ])
      expect(other).not.toEqual(key);
  });
  it.each([
    ["en", "en-US"],
    ["EN-gb", "en-US"],
    ["pt", "pt-BR"],
    ["pt-BR", "pt-BR"],
    ["fr", "pt-BR"],
  ])("maps %s to %s", (input, expected) => expect(missionLanguage(input)).toBe(expected));
  it.each(["pt-BR", "en-US"])(
    "formats timestamps in São Paulo rather than the UTC calendar day (%s)",
    (language) => {
      const formatted = missionDate("2026-11-13T01:30:00Z", language);
      expect(formatted).toBe(
        new Intl.DateTimeFormat(language, {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        }).format(new Date("2026-11-13T01:30:00Z")),
      );
      expect(formatted).toContain("12");
    },
  );
  it("does not render Invalid Date for an invalid display timestamp", () =>
    expect(missionDate("bad", "pt-BR")).toBeNull());
});

describe("mission page ranges", () => {
  it.each([
    [0, 1, 0, 0, 1, false, false],
    [1, 1, 1, 1, 1, false, false],
    [20, 1, 1, 20, 1, false, false],
    [21, 1, 1, 20, 2, false, true],
    [21, 2, 21, 21, 2, true, false],
    [21, 3, 0, 0, 2, true, false],
  ])(
    "labels total %s/page %s without using visible rows as the total",
    (total, number, start, end, pages, previous, next) => {
      expect(
        missionPageRange(page({ total: total as number, page: number as number })),
      ).toMatchObject({ start, end, pages, hasPrevious: previous, hasNext: next });
    },
  );
  it("marks a vanished page separately from an empty workspace", () => {
    expect(missionPageRange(page({ total: 21, page: 3 })).outOfRange).toBe(true);
    expect(missionPageRange(page({ total: 0 })).outOfRange).toBe(false);
  });
  it("keeps the true count while stopping navigation at the bounded page limit", () => {
    const range = missionPageRange(
      page({ total: MISSION_MAX_PAGE * 20 + 1, page: MISSION_MAX_PAGE }),
    );
    expect(range.pages).toBe(MISSION_MAX_PAGE + 1);
    expect(range.hasNext).toBe(false);
    expect(range.reachedPageLimit).toBe(true);
  });
});

describe("read recovery never reclassifies an uncertain write", () => {
  it.each([true, false])("preserves uncertainty after read=%s", (ok) =>
    expect(missionFeedbackAfterRead({ kind: "unconfirmed" }, ok)).toEqual({ kind: "unconfirmed" }),
  );
  it.each(["created", "statusSaved"] as const)(
    "preserves confirmed %s and clears a resolved read warning",
    (kind) => {
      expect(
        missionFeedbackAfterRead({ kind, readFailed: true, eventMissing: true }, true),
      ).toEqual({ kind, readFailed: false, eventMissing: true });
      expect(missionFeedbackAfterRead({ kind }, false)).toEqual({ kind, readFailed: true });
    },
  );
  it("replaces a failed refresh notice after recovery", () => {
    expect(missionFeedbackAfterRead({ kind: "refreshFailed" }, true)).toEqual({
      kind: "refreshed",
    });
    expect(missionFeedbackAfterRead(null, false)).toEqual({ kind: "refreshFailed" });
  });
});
