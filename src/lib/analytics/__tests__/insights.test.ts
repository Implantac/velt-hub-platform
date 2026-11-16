import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectFacebook,
  collectInstagram,
  collectLinkedIn,
  collectYouTube,
  collectorFor,
  platformsWithInsights,
  InsightAuthError,
  InsightRateLimitError,
  type InsightContext,
} from "../insights.server";
const fetcher = vi.fn<typeof fetch>();
const ctx: InsightContext = {
  platform: "facebook",
  externalPostId: "QA_R6_POST_NEVER_SENT",
  accessToken: "QA_R6_ACCESS_NEVER_SENT",
  channelConfig: {},
  channelExternalId: null,
};
const social = {
  likes: { summary: { total_count: 2 } },
  comments: { summary: { total_count: 0 } },
  shares: { count: 0 },
};
beforeEach(() => {
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("collectors never claim an unavailable or failed read as a zero observation", () => {
  it.each(["tiktok", "google_business", "unknown"])(
    "does not register a callable empty collector for unsupported %s insights",
    (platform) => {
      expect(collectorFor(platform)).toBeNull();
      expect(platformsWithInsights()).not.toContain(platform);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("uses the operational collector registry as the single capability source", () => {
    expect(platformsWithInsights().sort()).toEqual([
      "facebook",
      "instagram",
      "linkedin",
      "youtube",
    ]);
    for (const platform of platformsWithInsights())
      expect(collectorFor(platform)).toBeTypeOf("function");
  });
  it("propagates an Instagram insights credential refusal instead of accepting fallback counters", async () => {
    fetcher.mockImplementation(async (input) =>
      new URL(String(input)).pathname.endsWith("/insights")
        ? Response.json(
            { error: { code: 190, message: "QA_PRIVATE_UPSTREAM_BODY" } },
            { status: 401 },
          )
        : Response.json({ like_count: 2, comments_count: 0 }),
    );
    await expect(collectInstagram({ ...ctx, platform: "instagram" })).rejects.toBeInstanceOf(
      InsightAuthError,
    );
  });
  it.each([401, 429, 503])("does not conceal failed Facebook insights (%s)", async (status) => {
    fetcher.mockImplementation(async (input) =>
      new URL(String(input)).pathname.endsWith("/insights")
        ? Response.json({ error: { message: "QA_PRIVATE_UPSTREAM_BODY" } }, { status })
        : Response.json(social),
    );
    await expect(collectFacebook(ctx)).rejects.toThrow();
  });
  it("keeps rate limiting distinguishable", async () => {
    fetcher.mockImplementation(async (input) =>
      new URL(String(input)).pathname.endsWith("/insights")
        ? Response.json({}, { status: 429 })
        : Response.json(social),
    );
    await expect(collectFacebook(ctx)).rejects.toBeInstanceOf(InsightRateLimitError);
  });
  it("sends Meta credentials only in bearer headers, never URLs", async () => {
    fetcher.mockImplementation(async (input) =>
      new URL(String(input)).pathname.endsWith("/insights")
        ? Response.json({ data: [] })
        : Response.json(social),
    );
    await collectFacebook(ctx);
    for (const [input, init] of fetcher.mock.calls) {
      expect(String(input)).not.toContain(ctx.accessToken);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer " + ctx.accessToken);
    }
  });
  it("does not return a private upstream error body in its error message", async () => {
    fetcher.mockResolvedValue(
      Response.json({ error: { message: "QA_PRIVATE_UPSTREAM_BODY" } }, { status: 500 }),
    );
    await expect(collectFacebook(ctx)).rejects.not.toThrow("QA_PRIVATE_UPSTREAM_BODY");
  });
  it("returns no observation for a missing YouTube video", async () => {
    fetcher.mockResolvedValue(Response.json({ items: [] }));
    expect(await collectYouTube({ ...ctx, platform: "youtube" })).toBeNull();
  });
  it("returns no observation for an empty YouTube statistics object", async () => {
    fetcher.mockResolvedValue(Response.json({ items: [{ statistics: {} }] }));
    expect(await collectYouTube({ ...ctx, platform: "youtube" })).toBeNull();
  });
  it("retains an actually observed zero-view YouTube video", async () => {
    fetcher.mockResolvedValue(Response.json({ items: [{ statistics: { viewCount: "0" } }] }));
    expect((await collectYouTube({ ...ctx, platform: "youtube" }))?.metrics.video_views).toBe(0);
  });
  it("does not invent a zero observation from empty Facebook responses", async () => {
    fetcher.mockImplementation(async () => Response.json({}));
    expect(await collectFacebook(ctx)).toBeNull();
  });
  it("does not invent a zero observation after a LinkedIn socialActions failure", async () => {
    fetcher.mockResolvedValue(
      Response.json({ message: "QA_PRIVATE_UPSTREAM_BODY" }, { status: 503 }),
    );
    await expect(collectLinkedIn({ ...ctx, platform: "linkedin" })).rejects.toThrow();
  });
  it("does not conceal failed configured LinkedIn organisation statistics", async () => {
    fetcher.mockImplementation(async (input) =>
      String(input).includes("socialActions")
        ? Response.json({ likesSummary: { totalLikes: 2 } })
        : Response.json({}, { status: 503 }),
    );
    await expect(
      collectLinkedIn({ ...ctx, platform: "linkedin", channelConfig: { organization_id: "123" } }),
    ).rejects.toThrow();
  });
});
