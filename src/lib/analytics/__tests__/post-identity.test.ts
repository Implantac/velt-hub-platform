import { describe, expect, it } from "vitest";
import { aggregateSnapshots, latestSnapshots, type Snapshot } from "../snapshots";
import { fromFacebook, fromLinkedIn } from "../normalize";
const row = (
  id: string,
  postId: string,
  impressions: number,
  captured_at = "2026-11-12T12:00:00Z",
): Snapshot => ({
  id,
  channel_id: "channel",
  content_id: "reused-content",
  captured_at,
  metrics: { impressions, post_id: postId },
  channel: { platform: "facebook" },
});
describe("published post identity survives content reuse", () => {
  it("keeps two real publications of the same content on the same channel separate", () => {
    expect(aggregateSnapshots([row("1", "post-1", 100), row("2", "post-2", 200)]).totals).toEqual({
      impressions: 300,
      engagement: 0,
      reach: 0,
      posts: 2,
    });
  });
  it("still deduplicates repeated observations of the same publication", () => {
    expect(
      aggregateSnapshots([
        row("1", "post-1", 100),
        row("2", "post-1", 120, "2026-11-12T18:00:00Z"),
        row("3", "post-2", 200),
      ]).totals.impressions,
    ).toBe(320);
  });
  it("groups legacy timestamp offsets by their actual UTC day", () => {
    const rows = [
      row("1", "post-1", 100, "2026-11-12T23:30:00-03:00"),
      row("2", "post-1", 120, "2026-11-13T03:00:00Z"),
    ];
    expect(latestSnapshots(rows, true)).toHaveLength(1);
    expect(aggregateSnapshots(rows).daily).toEqual([
      { date: "2026-11-13", impressions: 120, engagement: 0, reach: 0 },
    ]);
  });
  it("does not treat LinkedIn's engagement ratio as an integer interaction count", () => {
    expect(
      fromLinkedIn({
        likeCount: 10,
        commentCount: 2,
        shareCount: 1,
        impressionCount: 100,
        engagement: 0.13,
      }),
    ).toMatchObject({ engagement: 13, engagement_rate: 0.13 });
  });
  it("reads Facebook reaction breakdowns without dropping them as a nonnumeric field", () => {
    expect(
      fromFacebook(
        {},
        {
          data: [
            { name: "post_reactions_by_type_total", values: [{ value: { like: 10, love: 3 } }] },
          ],
        },
      ),
    ).toMatchObject({ likes: 13, engagement: 13 });
  });
});

describe("legacy observation compatibility", () => {
  it("does not double-count an unattributed legacy row alongside an identified post of the same content", () => {
    const old = {
      ...row("old", "ignored", 80, "2026-11-11T10:00:00Z"),
      metrics: { impressions: 80 },
    };
    const result = aggregateSnapshots([old, row("new", "post-1", 100)]);
    expect(result.totals).toMatchObject({ impressions: 100, posts: 1 });
    expect(result.daily).toHaveLength(2);
  });
  it("excludes an unattributed same-day legacy read, but not a distinct external publication", () => {
    const old = { ...row("old", "ignored", 80), metrics: { impressions: 80 } };
    expect(
      aggregateSnapshots([old, row("new", "post-1", 100), row("other", "post-2", 200)]).daily,
    ).toEqual([{ date: "2026-11-12", impressions: 300, engagement: 0, reach: 0 }]);
  });
});
