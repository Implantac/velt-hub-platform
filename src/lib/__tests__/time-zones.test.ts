import { describe, expect, it } from "vitest";
import {
  browserTimeZone,
  formatZonedInstant,
  isTimeZone,
  shiftCalendarDate,
  zonedInstants,
  zonedParts,
} from "../time-zones";
import { nextSlotOccurrence } from "../growth/scheduling";

const iso = (dates: Date[]) => dates.map((d) => d.toISOString());
describe("explicit IANA calendar conversions", () => {
  it.each([
    "UTC",
    "America/Sao_Paulo",
    "America/New_York",
    "Asia/Kolkata",
    "Asia/Kathmandu",
    "Australia/Lord_Howe",
  ])("accepts a supported zone: %s", (zone) => {
    expect(isTimeZone(zone)).toBe(true);
  });
  it.each(["", "Not/A_Zone", "x".repeat(101), "+05:30", "-03:00", "+0530", "-03"])(
    "rejects invalid or unnamed fixed-offset zones without substituting another: %s",
    (zone) => {
      expect(isTimeZone(zone)).toBe(false);
    },
  );
  it("resolves a usable browser zone", () => {
    expect(isTimeZone(browserTimeZone())).toBe(true);
  });
  it("keeps midnight at hour zero and crosses the correct local date", () => {
    expect(zonedParts("2026-11-02T03:00:00Z", "America/Sao_Paulo")).toEqual({
      year: 2026,
      month: 11,
      day: 2,
      weekday: 1,
      hour: 0,
      minute: 0,
      second: 0,
    });
    expect(zonedParts("2026-11-02T01:00:00Z", "America/New_York")).toMatchObject({
      day: 1,
      weekday: 0,
      hour: 20,
    });
  });
  it.each([
    ["Asia/Kolkata", "2026-11-02T05:30:00.000Z"],
    ["Asia/Kathmandu", "2026-11-02T05:15:00.000Z"],
    ["America/Sao_Paulo", "2026-11-02T14:00:00.000Z"],
    ["UTC", "2026-11-02T11:00:00.000Z"],
  ])("does not round non-hour offsets in %s", (zone, expected) => {
    expect(iso(zonedInstants({ year: 2026, month: 11, day: 2 }, 11, 0, zone))).toEqual([expected]);
  });
  it("returns both fall-back instants, in chronological order", () => {
    expect(
      iso(zonedInstants({ year: 2026, month: 11, day: 1 }, 1, 30, "America/New_York")),
    ).toEqual(["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"]);
  });
  it("does not normalize a spring-forward gap to another wall time", () => {
    expect(zonedInstants({ year: 2026, month: 3, day: 8 }, 2, 30, "America/New_York")).toEqual([]);
  });
  it("handles a 30-minute DST overlap", () => {
    expect(
      iso(zonedInstants({ year: 2026, month: 4, day: 5 }, 1, 45, "Australia/Lord_Howe")),
    ).toEqual(["2026-04-04T14:45:00.000Z", "2026-04-04T15:15:00.000Z"]);
  });
  it("rejects a 30-minute DST gap and an entirely skipped calendar date", () => {
    expect(zonedInstants({ year: 2026, month: 10, day: 4 }, 2, 15, "Australia/Lord_Howe")).toEqual(
      [],
    );
    expect(zonedInstants({ year: 2011, month: 12, day: 30 }, 12, 0, "Pacific/Apia")).toEqual([]);
  });
  it.each([
    [{ year: 2026, month: 2, day: 30 }, 11, 0],
    [{ year: 2026, month: 11, day: 2 }, 24, 0],
    [{ year: 2026, month: 11, day: 2 }, 11, 60],
  ] as const)("does not silently normalize invalid calendar input", (date, hour, minute) => {
    expect(zonedInstants(date, hour, minute, "UTC")).toEqual([]);
  });
  it("performs date arithmetic independently of the process timezone and DST", () => {
    expect(shiftCalendarDate({ year: 2026, month: 12, day: 31 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    });
    expect(shiftCalendarDate({ year: 2028, month: 2, day: 28 }, 1)).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
  });
  it("can use the second overlap occurrence when the first has passed the lead boundary", () => {
    const next = nextSlotOccurrence(
      { weekday: 0, hour: 1 },
      new Date("2026-11-01T05:15:00Z"),
      "America/New_York",
      30,
    );
    expect(next?.at.toISOString()).toBe("2026-11-01T06:00:00.000Z");
  });
  it("skips a nonexistent weekly occurrence rather than returning a changed hour", () => {
    const next = nextSlotOccurrence(
      { weekday: 0, hour: 2 },
      new Date("2026-03-08T05:00:00Z"),
      "America/New_York",
      30,
    );
    expect(next?.at.toISOString()).toBe("2026-03-15T06:00:00.000Z");
  });
  it("localizes date labels and displays the offset of that actual instant", () => {
    const at = "2026-11-02T05:30:00Z";
    expect(formatZonedInstant(at, "en-US", "Asia/Kolkata")).toContain("Nov");
    expect(formatZonedInstant(at, "pt-BR", "Asia/Kolkata")).toContain("nov");
    expect(formatZonedInstant(at, "en-US", "Asia/Kolkata")).toContain("GMT+5:30");
    expect(formatZonedInstant("not-a-date", "en-US", "UTC")).toBe("—");
  });
  it("finds the next real weekly occurrence beyond a skipped DST Sunday", () => {
    const next = nextSlotOccurrence(
      { weekday: 0, hour: 2 },
      new Date("2026-03-07T05:00:00Z"),
      "America/New_York",
      30,
    );
    expect(next?.at.toISOString()).toBe("2026-03-15T06:00:00.000Z");
  });
});
