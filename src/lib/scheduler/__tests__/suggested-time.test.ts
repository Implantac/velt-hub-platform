import { afterEach, describe, expect, it, vi } from "vitest";
import { futureScheduleIso, localDateTime, selectedScheduleIso } from "../scheduling";

afterEach(() => vi.unstubAllEnvs());
describe("using a suggestion only fills a form and preserves its exact UTC instant", () => {
  it.each(["UTC", "America/Sao_Paulo", "Asia/Kolkata", "Asia/Kathmandu"])(
    "round-trips a chosen minute through browser-local fields in %s",
    (zone) => {
      vi.stubEnv("TZ", zone);
      const at = "2026-12-12T14:30:00.000Z";
      const value = localDateTime(new Date(at));
      expect(selectedScheduleIso(value, at, Date.parse("2026-11-12T00:00:00Z"))).toBe(at);
    },
  );
  it("does not reinterpret the second DST occurrence as the first", () => {
    vi.stubEnv("TZ", "America/New_York");
    const at = "2026-11-01T06:00:00.000Z",
      now = Date.parse("2026-11-01T05:15:00Z");
    const value = localDateTime(new Date(at));
    expect(value).toBe("2026-11-01T01:00");
    expect(futureScheduleIso(value, now)).toBeNull(); // Native parser chooses the already-past first occurrence.
    expect(selectedScheduleIso(value, at, now)).toBe(at);
  });
  it("rejects an invisible override when the field no longer represents the chosen instant", () => {
    vi.stubEnv("TZ", "UTC");
    expect(selectedScheduleIso("2026-12-12T14:31", "2026-12-12T14:30:00Z", 0)).toBeNull();
  });
  it("uses the normal validation after a manual edit clears the selected instant", () => {
    vi.stubEnv("TZ", "UTC");
    expect(selectedScheduleIso("2026-12-12T14:31", null, 0)).toBe("2026-12-12T14:31:00.000Z");
  });
  it("does not turn stale or invalid suggestions into now", () => {
    vi.stubEnv("TZ", "UTC");
    const now = Date.parse("2026-12-12T15:00:00Z");
    expect(selectedScheduleIso("2026-12-12T14:30", "2026-12-12T14:30:00Z", now)).toBeNull();
    expect(selectedScheduleIso("2026-12-12T14:30", "invalid", now)).toBeNull();
  });
  it("rejects seconds hidden by a minute-precision native field", () => {
    vi.stubEnv("TZ", "UTC");
    expect(selectedScheduleIso("2026-12-12T14:30", "2026-12-12T14:30:30Z", 0)).toBeNull();
  });
});
