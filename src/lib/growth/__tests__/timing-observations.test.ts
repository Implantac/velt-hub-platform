import { describe, expect, it } from "vitest";
import { timingObservations, type TimingJob, type TimingSnapshot } from "../timing-observations";

// Synthetic data only; these tests do not write snapshots or claim external observations.
const now = Date.parse("2026-11-12T12:00:00Z");
const job: TimingJob = {
  id: "job-a",
  channel_id: "channel-a",
  content_id: "reused-content",
  status: "succeeded",
  external_post_id: "external-a",
  delivery_started_at: "2026-11-01T10:03:00Z",
};
const snap: TimingSnapshot = {
  id: "snapshot-a",
  channel_id: job.channel_id,
  content_id: job.content_id,
  captured_at: "2026-11-02T12:00:00Z",
  metrics: {
    source: "sync",
    post_id: job.external_post_id,
    job_id: job.id,
    engagement: 12,
    impressions: 100,
  },
};
const metrics = (patch: Record<string, unknown>) => ({ ...(snap.metrics as object), ...patch });
const measure = (jobs = [job], snaps = [snap]) => timingObservations(jobs, snaps, now);

describe("timing history attribution", () => {
  it("uses recorded send start, not a scheduled time or collection date", () => {
    expect(measure()).toEqual({
      observations: [{ publishedAt: job.delivery_started_at, engagement: 12, impressions: 100 }],
      latestCapturedAt: snap.captured_at,
    });
  });
  it("uses the latest cumulative snapshot only once without summing collections", () => {
    const later = {
      ...snap,
      id: "later",
      captured_at: "2026-11-03T12:00:00Z",
      metrics: metrics({ engagement: 19 }),
    };
    expect(measure([job], [later, snap]).observations).toEqual([
      { publishedAt: job.delivery_started_at, engagement: 19, impressions: 100 },
    ]);
  });
  it("does not reuse one content's metrics for a second external publication", () => {
    const second = {
      ...job,
      id: "job-b",
      external_post_id: "external-b",
      delivery_started_at: "2026-11-04T20:00:00Z",
    };
    expect(measure([job, second]).observations).toHaveLength(1);
    const other = {
      ...snap,
      id: "snapshot-b",
      captured_at: "2026-11-05T00:00:00Z",
      metrics: metrics({ job_id: second.id, post_id: second.external_post_id, engagement: 7 }),
    };
    expect(measure([job, second], [snap, other]).observations.map((o) => o.engagement)).toEqual([
      12, 7,
    ]);
  });
  it("does not transfer measurements between channels, even for the same post/content IDs", () => {
    const other = { ...snap, channel_id: "channel-b", metrics: metrics({ engagement: 999 }) };
    expect(measure([job], [other]).observations).toEqual([]);
  });
  it("deduplicates a repeated external identity across jobs", () => {
    const duplicate = { ...job, id: "duplicate-job" };
    const duplicateSnap = {
      ...snap,
      id: "z",
      metrics: metrics({ job_id: duplicate.id, engagement: 15 }),
    };
    expect(measure([job, duplicate], [snap, duplicateSnap]).observations).toHaveLength(1);
    expect(measure([job, duplicate], [snap, duplicateSnap]).observations[0].engagement).toBe(15);
  });
  it("declines conflicting attribution instead of inventing a send time", () => {
    const conflicting = { ...job, id: "conflicting", delivery_started_at: "2026-11-02T20:00:00Z" };
    expect(measure([job, conflicting]).observations).toEqual([]);
  });
  it.each([
    { status: "pending" },
    { status: "dead_letter" },
    { external_post_id: null },
    { external_post_id: "sim_fake" },
    { external_post_id: " external-a" },
    { delivery_started_at: null },
    { delivery_started_at: "invalid" },
    { delivery_started_at: "2027-01-01T00:00:00Z" },
  ])("does not treat an ineligible/unattributed job as a measured publication: %o", (patch) => {
    expect(measure([{ ...job, ...patch }]).observations).toEqual([]);
  });
  it.each([
    { source: "manual" },
    { post_id: "external-b" },
    { job_id: "other-job" },
    { post_id: undefined },
    { job_id: undefined },
    { source: undefined },
  ])("requires confirmed sync/post/job provenance: %o", (patch) => {
    expect(measure([job], [{ ...snap, metrics: metrics(patch) }]).observations).toEqual([]);
  });
  it.each([
    { captured_at: "invalid" },
    { captured_at: "2026-10-01T00:00:00Z" },
    { captured_at: "2027-01-01T00:00:00Z" },
    { content_id: "other-content" },
  ])("ignores a snapshot with an invalid boundary or attribution: %o", (patch) => {
    expect(measure([job], [{ ...snap, ...patch }]).observations).toEqual([]);
  });
  it.each([undefined, -1, NaN, Infinity, "bad"])(
    "does not convert unavailable/invalid engagement %s to zero",
    (engagement) => {
      expect(measure([job], [{ ...snap, metrics: metrics({ engagement }) }]).observations).toEqual(
        [],
      );
    },
  );
  it("preserves an actually observed zero without claiming it is missing", () => {
    expect(
      measure([job], [{ ...snap, metrics: metrics({ engagement: 0 }) }]).observations[0].engagement,
    ).toBe(0);
  });
  it("does not quietly fall back to an older observation when the latest is corrupt", () => {
    const invalidLatest = {
      ...snap,
      id: "later",
      captured_at: "2026-11-03T00:00:00Z",
      metrics: metrics({ engagement: undefined }),
    };
    expect(measure([job], [snap, invalidLatest]).observations).toEqual([]);
  });
  it("uses reach when positive impressions were not available, without a fictitious denominator", () => {
    expect(
      measure([job], [{ ...snap, metrics: metrics({ impressions: 0, reach: 50 }) }]).observations[0]
        .impressions,
    ).toBe(50);
    expect(
      measure([job], [{ ...snap, metrics: metrics({ impressions: undefined }) }]).observations[0],
    ).not.toHaveProperty("impressions");
  });
  it("does not mix reach ratios and impression ratios across publications", () => {
    const second = { ...job, id: "job-b", external_post_id: "external-b" };
    const other = {
      ...snap,
      id: "snapshot-b",
      metrics: metrics({
        job_id: second.id,
        post_id: second.external_post_id,
        impressions: 0,
        reach: 50,
      }),
    };
    const result = measure([job, second], [snap, other]);
    expect(result.observations).toHaveLength(2);
    expect(result.observations.every((o) => o.impressions === undefined)).toBe(true);
  });
});
