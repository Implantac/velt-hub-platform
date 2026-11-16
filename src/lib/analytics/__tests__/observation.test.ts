import { describe, expect, it } from "vitest";
import { EMPTY_METRICS, observationMetrics } from "../normalize";
import { hasObservationReceipt, syncOutcome, type SyncSummary } from "../sync-result";

const receipt = {
  accepted: true,
  snapshot_id: "60000000-0000-4000-8000-000000000001",
  captured_at: "2026-11-12T18:00:00.123456+00:00",
};
describe("observation write contract", () => {
  it("accepts observed zero counters and strips arbitrary metadata", () => {
    expect(observationMetrics({ ...EMPTY_METRICS, access_token: "QA_NOT_A_REAL_TOKEN" })).toEqual(
      EMPTY_METRICS,
    );
  });
  it("does not substitute zero for missing counters or an absent observation", () => {
    for (const value of [null, {}, [], 1, { impressions: 1 }]) {
      expect(observationMetrics(value)).toBeNull();
    }
  });
  it.each([true, "12", -1, 1.25, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects a noncanonical counter %s",
    (impressions) => expect(observationMetrics({ ...EMPTY_METRICS, impressions })).toBeNull(),
  );
  it.each([-1, Infinity, NaN, "0.5", null])("rejects an invalid rate %s", (engagement_rate) => {
    expect(observationMetrics({ ...EMPTY_METRICS, engagement_rate })).toBeNull();
  });
  it("derives the ratio from counters, not provider metadata", () => {
    expect(
      observationMetrics({ ...EMPTY_METRICS, reach: 100, engagement: 12, engagement_rate: 99 }),
    ).toMatchObject({ engagement_rate: 0.12 });
  });
  it("accepts an observed account follower count of zero", () => {
    expect(observationMetrics({ ...EMPTY_METRICS, followers: 100 }, 0)?.followers).toBe(0);
  });
  it.each([-1, "100", NaN, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "does not override followers with invalid account count %s",
    (followers) => expect(observationMetrics(EMPTY_METRICS, followers)).toBeNull(),
  );
  it("requires a positive, complete database receipt", () => {
    expect(hasObservationReceipt(receipt)).toBe(true);
    for (const value of [
      null,
      [],
      true,
      {},
      { ...receipt, accepted: "true" },
      { ...receipt, accepted: false },
      { ...receipt, snapshot_id: "missing" },
      { ...receipt, captured_at: "2026-11-12" },
      { ...receipt, captured_at: "infinity" },
    ]) {
      expect(hasObservationReceipt(value)).toBe(false);
    }
  });
});

describe("honest run outcomes", () => {
  const issue: SyncSummary["errors"][number] = {
    channelId: "qa",
    platform: "facebook",
    code: "collection_failed",
    error: "safe",
    count: 1,
  };
  it.each([
    { snapshotsWritten: 2, postsUnavailable: 0, errors: [], outcome: "success" },
    { snapshotsWritten: 1, postsUnavailable: 0, errors: [issue], outcome: "partial" },
    { snapshotsWritten: 1, postsUnavailable: 1, errors: [], outcome: "partial" },
    { snapshotsWritten: 0, postsUnavailable: 0, errors: [issue], outcome: "error" },
    { snapshotsWritten: 0, postsUnavailable: 2, errors: [], outcome: "empty" },
    { snapshotsWritten: 0, postsUnavailable: 0, errors: [], outcome: "empty" },
  ])("returns $outcome for an acknowledged subset", (value) => {
    expect(syncOutcome({ skipped: [], ...value })).toBe(value.outcome);
  });
  it.each(["unsupported", "unavailable"] as const)(
    "does not announce complete success when another channel was skipped as %s",
    (code) => {
      const result: SyncSummary = {
        channelsConsidered: 2,
        channelsSynced: 1,
        postsMeasured: 1,
        snapshotsWritten: 1,
        postsUnavailable: 0,
        errors: [],
        durationMs: 0,
        skipped: [{ channelId: "QA_CHANNEL", platform: "tiktok", code, reason: "QA skip" }],
      };
      expect(syncOutcome(result)).toBe("partial");
    },
  );
  it("does not turn an otherwise acknowledged run partial just because a channel has no publications", () => {
    expect(
      syncOutcome({
        snapshotsWritten: 1,
        postsUnavailable: 0,
        errors: [],
        skipped: [
          {
            channelId: "QA_CHANNEL",
            platform: "facebook",
            code: "no_publications",
            reason: "QA no posts",
          },
        ],
      }),
    ).toBe("success");
  });
});

describe("receipt calendar integrity", () => {
  it.each([
    "2026-02-30T12:00:00Z",
    "2026-11-12T24:00:00Z",
    "2026-11-12T00:60:00Z",
    "2026-13-12T12:00:00Z",
  ])("refuses invalid database timestamp %s", (captured_at) => {
    expect(hasObservationReceipt({ ...receipt, captured_at })).toBe(false);
  });
});
