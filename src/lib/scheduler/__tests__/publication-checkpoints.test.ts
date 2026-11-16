import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("../media-download.server", () => ({ downloadPublicMedia: mocks.download }));
import { publishFacebook, publishInstagram } from "../publishers/meta.server";
import { publishGoogleBusiness } from "../publishers/google-business.server";
import { publishTikTok } from "../publishers/tiktok.server";
import { publishYouTube } from "../publishers/youtube.server";
import { publishLinkedIn } from "../publishers/linkedin.server";
import type { Platform, PublishInput } from "../contracts";

const publishers = {
  facebook: publishFacebook,
  instagram: publishInstagram,
  google_business: publishGoogleBusiness,
  tiktok: publishTikTok,
  youtube: publishYouTube,
  linkedin: publishLinkedIn,
};
type Supported = keyof typeof publishers;
let events: string[], urls: string[];
const reply = (data: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(data), { status, headers });
function input(platform: Supported): PublishInput {
  const external_id = {
    facebook: "111",
    instagram: "111",
    google_business: "accounts/100/locations/200",
    tiktok: "qa_creator",
    youtube: "UC_qa_expected",
    linkedin: "qa_person",
  }[platform];
  return {
    platform,
    jobId: "qa_job",
    workspaceId: "qa_workspace",
    channelId: "qa_channel",
    contentId: "qa_content",
    channelConfig: { access_token: "QA_INVALID_TEST_NOT_SENT", external_id },
    payload: {
      title: "Synthetic checkpoint test",
      body: "No provider is contacted and no content is published.",
      media_urls: ["instagram"].includes(platform)
        ? ["https://cdn.example.com/test.jpg"]
        : ["youtube", "tiktok"].includes(platform)
          ? ["https://cdn.example.com/test.mp4"]
          : [],
    },
    beforeWrite: async () => {
      events.push("boundary");
    },
    checkpoint: async (reference) => {
      events.push(`checkpoint:${reference.kind}:${reference.id}`);
    },
  };
}
beforeEach(() => {
  events = [];
  urls = [];
  vi.stubEnv("TIKTOK_DIRECT_POST", "true");
  mocks.download.mockReset().mockResolvedValue(new Uint8Array(8));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (inputUrl: string | URL, init?: RequestInit) => {
      const url = new URL(String(inputUrl));
      urls.push(url.toString());
      events.push(`${init?.method ?? "GET"}:${url.pathname}`);
      if (url.hostname === "graph.facebook.com") {
        if (url.pathname.endsWith("/media")) return reply({ id: "222" });
        if (url.pathname.endsWith("/media_publish")) return reply({ id: "333" });
        if (url.pathname.endsWith("/222")) return reply({ id: "222", status_code: "FINISHED" });
        if (url.pathname.endsWith("/333"))
          return reply({
            id: "333",
            owner: { id: "111" },
            permalink: "https://www.instagram.com/p/qa_not_sent/",
          });
        if (url.pathname.endsWith("/feed")) return reply({ id: "111_444" });
        if (url.pathname.endsWith("/photos")) return reply({ id: "555", post_id: "111_444" });
        if (url.pathname.endsWith("/111_444"))
          return reply({
            id: "111_444",
            from: { id: "111" },
            is_published: true,
            is_hidden: false,
            is_expired: false,
          });
      }
      if (url.hostname === "mybusiness.googleapis.com")
        return reply({ name: "accounts/100/locations/200/localPosts/qa_not_sent", state: "LIVE" });
      if (url.pathname.endsWith("/creator_info/query/"))
        return reply({
          data: { privacy_level_options: ["PUBLIC_TO_EVERYONE"] },
          error: { code: "ok" },
        });
      if (url.pathname.endsWith("/video/init/"))
        return reply({
          data: {
            publish_id: "qa_tracking",
            upload_url: "https://open-upload.tiktokapis.com/video/?upload_id=QA_SECRET_UPLOAD_URI",
          },
          error: { code: "ok" },
        });
      if (url.pathname.endsWith("/status/fetch/"))
        return reply({
          data: {
            status: "PUBLISH_COMPLETE",
            publicaly_available_post_id: ["7654321098765432101"],
          },
          error: { code: "ok" },
        });
      if (url.hostname === "open-upload.tiktokapis.com") return new Response(null, { status: 200 });
      if (url.pathname === "/upload/youtube/v3/videos")
        return init?.method === "POST"
          ? new Response(null, {
              status: 200,
              headers: {
                location:
                  "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=QA_SECRET_UPLOAD_URI",
              },
            })
          : reply({ id: "qaVideo12345" });
      if (url.pathname === "/youtube/v3/videos")
        return reply({
          items: [
            {
              id: "qaVideo12345",
              snippet: { channelId: "UC_qa_expected" },
              status: { uploadStatus: "processed", privacyStatus: "public" },
            },
          ],
        });
      if (url.pathname === "/rest/posts")
        return reply({}, 201, { "x-restli-id": "urn:li:share:123456789" });
      if (url.pathname.startsWith("/rest/posts/"))
        return reply({
          id: "urn:li:share:123456789",
          author: "urn:li:person:qa_person",
          lifecycleState: "PUBLISHED",
          visibility: "PUBLIC",
          distribution: { feedDistribution: "MAIN_FEED" },
        });
      throw new Error(`Unexpected mocked URL: ${url.hostname}${url.pathname}`);
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("durable provider boundaries — all network mocked", () => {
  it.each(Object.keys(publishers) as Supported[])(
    "awaits the fenced boundary before every %s write",
    async (platform) => {
      const value = input(platform);
      const result = await publishers[platform](value);
      expect(result.externalPostId).toBeTruthy();
      for (let i = 0; i < events.length; i++) {
        if (
          events[i].startsWith("PUT:") ||
          (events[i].startsWith("POST:") &&
            !events[i].includes("/creator_info/query/") &&
            !events[i].includes("/status/fetch/"))
        )
          expect(events[i - 1]).toBe("boundary");
      }
      expect(events.some((event) => event.startsWith("checkpoint:"))).toBe(true);
      for (const event of events.filter((e) => e.startsWith("checkpoint:")))
        expect(event).not.toContain("QA_SECRET_UPLOAD_URI");
    },
  );
  it.each(Object.keys(publishers) as Supported[])(
    "does not initiate a %s write when the boundary acknowledgement is lost",
    async (platform) => {
      const value = input(platform);
      value.beforeWrite = async () => {
        throw new Error("fenced database boundary unavailable");
      };
      await expect(publishers[platform](value)).rejects.toThrow("boundary unavailable");
      expect(
        events.filter((event) => event.startsWith("POST:") || event.startsWith("PUT:")),
      ).toEqual(platform === "tiktok" ? ["POST:/v2/post/publish/creator_info/query/"] : []);
    },
  );
  it.each(Object.keys(publishers) as Supported[])(
    "stops after a lost %s checkpoint and retains its exact reference",
    async (platform) => {
      const value = input(platform);
      value.checkpoint = async (reference) => {
        events.push("checkpoint_failed");
        throw new Error(`RPC response lost for ${reference.kind}`);
      };
      await expect(publishers[platform](value)).rejects.toMatchObject({
        retryable: false,
        reference: { id: expect.any(String) },
      });
      expect(events.at(-1)).toBe("checkpoint_failed");
      if (platform === "instagram")
        expect(events.filter((e) => e.includes("media_publish"))).toHaveLength(0);
      if (platform === "tiktok")
        expect(
          events.filter((e) => e.startsWith("PUT:") || e.includes("status/fetch")),
        ).toHaveLength(0);
    },
  );
  it("Instagram preserves container before polling and media before final confirmation", async () => {
    await publishInstagram(input("instagram"));
    expect(events.map((event) => event.replace(/^((?:GET|POST):)\/v\d+\.\d+\//, "$1/"))).toEqual([
      "boundary",
      "POST:/111/media",
      "checkpoint:instagram_container:222",
      "GET:/222",
      "boundary",
      "POST:/111/media_publish",
      "checkpoint:instagram_media:333",
      "GET:/333",
    ]);
  });
  it("Instagram keeps the final media reference, not the container, after a lost second checkpoint", async () => {
    const value = input("instagram");
    value.checkpoint = async (reference) => {
      if (reference.kind === "instagram_media") throw new Error("media checkpoint unavailable");
    };
    await expect(publishInstagram(value)).rejects.toMatchObject({
      reference: { kind: "instagram_media", id: "333" },
    });
  });
  it("Facebook uses photo post_id, not the separate uploaded photo resource", async () => {
    const value = input("facebook");
    value.payload.media_urls = ["https://cdn.example.com/test.jpg"];
    expect((await publishFacebook(value)).externalPostId).toBe("111_444");
    expect(urls.some((url) => new URL(url).pathname.endsWith("/photos"))).toBe(true);
    expect(events).toContain("checkpoint:facebook_post:111_444");
    expect(events).not.toContain("checkpoint:facebook_photo:555");
  });
  it("YouTube never persists the authoritative resumable upload URI", async () => {
    await publishYouTube(input("youtube"));
    expect(urls.some((url) => url.includes("QA_SECRET_UPLOAD_URI"))).toBe(true);
    expect(events.filter((event) => event.startsWith("checkpoint:"))).toEqual([
      "checkpoint:youtube_video:qaVideo12345",
    ]);
  });
  it.each(["tiktok", "google_business"] as Supported[])(
    "does not keep a %s worker in a multi-minute confirmation poll",
    async (platform) => {
      const original = globalThis.fetch;
      let reads = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL, init?: RequestInit) => {
          if (String(url).includes("status/fetch")) {
            reads++;
            return reply({ error: { code: "ok" }, data: { status: "PROCESSING_UPLOAD" } });
          }
          if (String(url).includes("mybusiness.googleapis.com")) {
            if (init?.method !== "POST") reads++;
            return reply({
              name: "accounts/100/locations/200/localPosts/qa_not_sent",
              state: "PROCESSING",
            });
          }
          return original(url, init);
        }),
      );
      await expect(publishers[platform](input(platform))).rejects.toMatchObject({
        reference: { kind: platform === "tiktok" ? "tiktok_publish" : "google_local_post" },
      });
      expect(reads).toBe(1);
    },
  );
  it.each(["facebook", "instagram", "youtube", "linkedin"] as Platform[])(
    "never places a %s bearer token in a query string",
    async (platform) => {
      await publishers[platform as Supported](input(platform as Supported));
      for (const url of urls) expect(url).not.toContain("QA_INVALID_TEST_NOT_SENT");
    },
  );
});
