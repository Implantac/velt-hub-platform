import { describe, expect, it } from "vitest";
import { localSlot, nextBestSlot, rankSlots } from "../scheduling";

// These are pure synthetic observations, not provider/database homologation.
describe("contextual timing regressions", () => {
  it("uses the requested IANA day/hour rather than the fixed Brazil offset", () => {
    expect(localSlot("2026-11-01T22:45:00Z", "Asia/Kolkata")).toEqual({
      weekday: 1,
      hour: 4,
    });
  });

  it("constructs reference windows in the requested timezone", () => {
    const from = new Date("2026-11-02T02:00:00Z");
    const result = nextBestSlot("instagram", [], from, 30, "Asia/Kolkata");
    expect(result.at).toBe("2026-11-02T05:30:00.000Z");
  });

  it("handles local date boundaries instead of reusing a UTC weekday", () => {
    expect(localSlot("2026-11-02T00:15:00Z", "America/New_York")).toEqual({
      weekday: 0,
      hour: 19,
    });
  });

  it("does not label six zero-engagement observations as a measured winning slot", () => {
    const observations = Array.from({ length: 6 }, (_, i) => ({
      publishedAt: new Date(Date.UTC(2026, 8, 7 + i * 7, 12)).toISOString(),
      engagement: 0,
    }));
    expect(rankSlots("instagram", observations).every((s) => s.confidence === "baseline")).toBe(
      true,
    );
  });

  it("does not count malformed observations towards the personalization threshold", () => {
    const valid = [
      { publishedAt: "2026-10-05T12:00:00Z", engagement: 10 },
      { publishedAt: "2026-10-12T12:00:00Z", engagement: 20 },
    ];
    const invalid = Array.from({ length: 4 }, () => ({ publishedAt: "not-a-date", engagement: 9 }));
    expect(
      rankSlots("instagram", [...valid, ...invalid]).every((s) => s.confidence === "baseline"),
    ).toBe(true);
  });

  it("never presents the wait-decay heuristic as measured percentage uplift", () => {
    const observations = Array.from({ length: 6 }, (_, i) => ({
      publishedAt: new Date(Date.UTC(2026, 8, 4 + i * 7, 15)).toISOString(),
      engagement: 100,
    }));
    const result = nextBestSlot("instagram", observations, new Date("2026-11-02T09:00:00Z"));
    expect(result.reason).not.toMatch(/%|rende|less|uplift/);
  });
});
