import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observePublication, type ObservationInput } from "../observe.server";
import { parseProviderJson } from "../provider-json.server";

// All HTTP is intercepted. Synthetic responses certify parsing, not provider homologation.
const network = vi.fn<typeof fetch>();
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const inputs: Record<string, ObservationInput> = {
  google: {
    platform: "google_business",
    target: "accounts/100/locations/200",
    reference: {
      kind: "google_local_post",
      id: "accounts/100/locations/200/localPosts/qa_not_sent",
    },
    accessToken: "QA_SECRET_NOT_SENT",
  },
  tiktok: {
    platform: "tiktok",
    target: "qa_creator",
    reference: { kind: "tiktok_publish", id: "qa_tracking_not_sent" },
    accessToken: "QA_SECRET_NOT_SENT",
  },
  youtube: {
    platform: "youtube",
    target: "UC_qa_expected",
    reference: { kind: "youtube_video", id: "qaVideo12345" },
    accessToken: "QA_SECRET_NOT_SENT",
  },
  linkedin: {
    platform: "linkedin",
    target: "urn:li:person:qa_expected",
    reference: { kind: "linkedin_post", id: "urn:li:share:123456789" },
    accessToken: "QA_SECRET_NOT_SENT",
  },
  facebook: {
    platform: "facebook",
    target: "111",
    reference: { kind: "facebook_post", id: "111_222" },
    accessToken: "QA_SECRET_NOT_SENT",
  },
  video: {
    platform: "facebook",
    target: "111",
    reference: { kind: "facebook_video", id: "222" },
    accessToken: "QA_SECRET_NOT_SENT",
  },
  photo: {
    platform: "facebook",
    target: "111",
    reference: { kind: "facebook_photo", id: "222" },
    accessToken: "QA_SECRET_NOT_SENT",
  },
  instagram: {
    platform: "instagram",
    target: "111",
    reference: { kind: "instagram_media", id: "222" },
    accessToken: "QA_SECRET_NOT_SENT",
  },
  container: {
    platform: "instagram",
    target: "111",
    reference: { kind: "instagram_container", id: "222" },
    accessToken: "QA_SECRET_NOT_SENT",
  },
};
beforeEach(() => {
  network.mockReset();
  vi.stubGlobal("fetch", network);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
async function check(key: string, data: unknown, state: string) {
  network.mockResolvedValue(response(data));
  const result = await observePublication(inputs[key]);
  expect(result.state).toBe(state);
  if (state !== "confirmed") expect(result).not.toHaveProperty("externalPostId");
  return result;
}

describe("source-aware provider JSON", () => {
  it("preserves an unquoted int64 identifier byte-for-byte", () => {
    expect(parseProviderJson('{"id":7654321098765432101,"safe":123,"fraction":1.5}')).toEqual({
      id: "7654321098765432101",
      safe: 123,
      fraction: 1.5,
    });
  });
  it.each(["1e30", "-1e30", "7654321098765432101.0"])(
    "rejects unsafe numeric notation %s rather than fabricating a rounded identifier",
    (id) => {
      expect(() => parseProviderJson(`{"id":${id}}`)).toThrow("unsafe numeric");
    },
  );
});

describe("read-only Google Business observation", () => {
  it.each(["LIVE", "RECURRING"])("confirms only an exact %s resource", async (state) => {
    const r = await check("google", { name: inputs.google.reference.id, state }, "confirmed");
    expect(r).toHaveProperty("externalPostId", inputs.google.reference.id);
  });
  it.each([
    ["PROCESSING", "pending"],
    ["SCHEDULED", "pending"],
    ["REJECTED", "rejected"],
    ["UNKNOWN", "review"],
    [undefined, "review"],
  ])("maps %s to %s", async (state, expected) => {
    await check("google", { name: inputs.google.reference.id, state }, expected!);
  });
  it("does not confirm a LIVE post from a different location", async () => {
    await check(
      "google",
      { name: "accounts/100/locations/999/localPosts/qa_not_sent", state: "LIVE" },
      "review",
    );
  });
});

describe("read-only TikTok status-fetch POST", () => {
  it("uses status fetch, never init/upload, and preserves numeric int64 IDs", async () => {
    network.mockResolvedValue(
      new Response(
        '{"error":{"code":"ok"},"data":{"status":"PUBLISH_COMPLETE","publicaly_available_post_id":[7654321098765432101]}}',
      ),
    );
    expect(await observePublication(inputs.tiktok)).toMatchObject({
      state: "confirmed",
      externalPostId: "7654321098765432101",
    });
    expect(network).toHaveBeenCalledTimes(1);
    const [url, init] = network.mock.calls[0];
    expect(String(url)).toBe("https://open.tiktokapis.com/v2/post/publish/status/fetch/");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ publish_id: inputs.tiktok.reference.id });
  });
  it.each([
    { ids: [] },
    { ids: undefined },
    { ids: ["not_public"] },
    { ids: [-123] },
    { ids: ["123", "456"] },
  ])("never uses a tracking ID or guesses a public post from %j", async ({ ids }) => {
    await check(
      "tiktok",
      {
        error: { code: "ok" },
        data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ids },
      },
      Array.isArray(ids) && ids.length > 1 ? "review" : "pending",
    );
  });
  it.each([
    ["PROCESSING_UPLOAD", "pending"],
    ["PROCESSING_DOWNLOAD", "pending"],
    ["FAILED", "rejected"],
    ["SEND_TO_USER_INBOX", "review"],
    ["UNRECOGNIZED", "review"],
  ])("maps %s to %s", async (status, expected) => {
    await check("tiktok", { error: { code: "ok" }, data: { status } }, expected);
  });
  it.each([
    ["rate_limit_exceeded", "pending"],
    ["internal_error", "pending"],
    ["access_token_invalid", "review"],
    [undefined, "review"],
  ])("handles provider error %s without guessing publication", async (code, expected) => {
    await check(
      "tiktok",
      {
        error: { code },
        data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["123456789"] },
      },
      expected!,
    );
  });
});

describe("YouTube processing is not public delivery", () => {
  const video = {
    id: inputs.youtube.reference.id,
    snippet: { channelId: inputs.youtube.target },
    status: { uploadStatus: "processed", privacyStatus: "public" },
    processingDetails: { processingStatus: "succeeded" },
  };
  it("requires a processed public video on the exact channel", async () => {
    await check("youtube", { items: [video] }, "confirmed");
  });
  it.each(["private", "unlisted", undefined])(
    "does not confirm %s visibility",
    async (privacyStatus) => {
      await check(
        "youtube",
        { items: [{ ...video, status: { ...video.status, privacyStatus } }] },
        "review",
      );
    },
  );
  it("keeps an uploaded video pending even if the request asked for public", async () => {
    await check(
      "youtube",
      { items: [{ ...video, status: { uploadStatus: "uploaded", privacyStatus: "public" } }] },
      "pending",
    );
  });
  it.each(["failed", "rejected", "deleted"])(
    "recognizes explicit terminal upload status %s",
    async (uploadStatus) => {
      await check(
        "youtube",
        { items: [{ ...video, status: { ...video.status, uploadStatus } }] },
        "rejected",
      );
    },
  );
  it.each(["failed", "terminated"])(
    "recognizes processing %s without marking published",
    async (processingStatus) => {
      await check(
        "youtube",
        { items: [{ ...video, processingDetails: { processingStatus } }] },
        "rejected",
      );
    },
  );
  it.each([{ items: [] }, { items: [video, video] }])(
    "requires exactly one matching resource: %j",
    async ({ items }) => {
      await check("youtube", { items }, "review");
    },
  );
  it("rejects a video from a foreign channel", async () => {
    await check(
      "youtube",
      { items: [{ ...video, snippet: { channelId: "UC_foreign" } }] },
      "review",
    );
  });
  it("rejects an ID mismatch in a public response", async () => {
    await check("youtube", { items: [{ ...video, id: "anotherVideo" }] }, "review");
  });
});

describe("LinkedIn exact author and public feed", () => {
  const post = {
    id: inputs.linkedin.reference.id,
    author: inputs.linkedin.target,
    lifecycleState: "PUBLISHED",
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED" },
  };
  it("confirms exact author, reference, lifecycle and visibility", async () => {
    await check("linkedin", post, "confirmed");
  });
  it.each([
    { author: "urn:li:person:foreign" },
    { id: "urn:li:share:987654321" },
    { visibility: "CONNECTIONS" },
    { distribution: { feedDistribution: "NONE" } },
  ])("does not confirm a mismatch %j", async (patch) => {
    await check("linkedin", { ...post, ...patch }, "review");
  });
  it.each([
    ["PROCESSING", "pending"],
    ["PUBLISH_REQUESTED", "pending"],
    ["PROCESSING_FAILED", "rejected"],
    ["DRAFT", "review"],
  ])("handles lifecycle %s", async (lifecycleState, expected) => {
    await check("linkedin", { ...post, lifecycleState }, expected);
  });
});

describe("Meta resources cannot impersonate a published post", () => {
  const post = {
    id: "111_222",
    from: { id: "111" },
    is_published: true,
    is_hidden: false,
    is_expired: false,
  };
  it("confirms a published, unhidden, unexpired post from the expected Page", async () => {
    await check("facebook", post, "confirmed");
  });
  it.each([
    { is_published: false },
    { is_hidden: true },
    { is_expired: true },
    { is_expired: undefined },
    { from: { id: "999" } },
    { id: "111_999" },
  ])("does not confirm %j", async (patch) => {
    await check("facebook", { ...post, ...patch }, "review");
  });
  it("does not make an arbitrary lookup to turn a photo ID into a guessed post", async () => {
    expect(await observePublication(inputs.photo)).toMatchObject({ state: "review" });
    expect(network).not.toHaveBeenCalled();
  });
  it.each([
    ["FINISHED", "review"],
    ["PUBLISHED", "review"],
    ["IN_PROGRESS", "pending"],
    ["ERROR", "rejected"],
    ["EXPIRED", "rejected"],
  ])("container %s is %s, not a media ID", async (status_code, expected) => {
    await check("container", { id: "222", status_code }, expected);
  });
  it("confirms only an Instagram media resource with its expected owner and permalink", async () => {
    await check(
      "instagram",
      { id: "222", owner: { id: "111" }, permalink: "https://www.instagram.com/p/qa_not_sent/" },
      "confirmed",
    );
  });
  it.each([
    { owner: { id: "999" } },
    { permalink: "https://instagram.com.evil.invalid/p/qa/" },
    { permalink: undefined },
  ])("does not confirm unverifiable media %j", async (patch) => {
    await check(
      "instagram",
      {
        id: "222",
        owner: { id: "111" },
        permalink: "https://www.instagram.com/p/qa_not_sent/",
        ...patch,
      },
      "review",
    );
  });
  const video = {
    id: "222",
    from: { id: "111" },
    published: true,
    status: { video_status: "ready", publishing_phase: { publish_status: "published" } },
  };
  it("requires actual published evidence in addition to video ready", async () => {
    await check("video", video, "confirmed");
  });
  it.each([
    { published: false },
    { status: { video_status: "ready", publishing_phase: { publish_status: "complete" } } },
    { status: { video_status: "ready", publishing_phase: { status: "complete" } } },
  ])("does not confuse readiness/completion with publication %j", async (patch) => {
    await check("video", { ...video, ...patch }, "review");
  });
  it("keeps processing video pending", async () => {
    await check("video", { ...video, status: { video_status: "processing" } }, "pending");
  });
  it("recognizes explicit video publishing failure", async () => {
    await check(
      "video",
      { ...video, status: { video_status: "ready", publishing_phase: { status: "error" } } },
      "rejected",
    );
  });
});

describe("observation security and unavailable providers", () => {
  it.each([401, 403, 404, 400])(
    "requires review on HTTP %s, never absence or success",
    async (status) => {
      network.mockResolvedValue(response({ error: "QA_SECRET_NOT_SENT" }, status));
      const result = await observePublication(inputs.google);
      expect(result.state).toBe("review");
      expect(JSON.stringify(result)).not.toContain("QA_SECRET_NOT_SENT");
    },
  );
  it.each([429, 500, 503])("backs off on HTTP %s without resending", async (status) => {
    network.mockResolvedValue(response({}, status));
    expect((await observePublication(inputs.google)).state).toBe("pending");
    expect(network).toHaveBeenCalledTimes(1);
  });
  it.each([
    new Error("token QA_SECRET_NOT_SENT reset"),
    new DOMException("timeout", "TimeoutError"),
  ])("redacts a thrown upstream error", async (error) => {
    network.mockRejectedValue(error);
    const r = await observePublication(inputs.google);
    expect(r.state).toBe("pending");
    expect(JSON.stringify(r)).not.toContain("QA_SECRET_NOT_SENT");
  });
  it("backs off after malformed JSON", async () => {
    network.mockResolvedValue(new Response("not json"));
    expect((await observePublication(inputs.google)).state).toBe("pending");
  });
  it("rejects an oversized provider body", async () => {
    network.mockResolvedValue(new Response("x".repeat(512_001)));
    expect((await observePublication(inputs.google)).state).toBe("pending");
  });
  it.each([
    { ...inputs.facebook, reference: { kind: "facebook_post" as const, id: "999_222" } },
    { ...inputs.google, accessToken: "" },
    { ...inputs.container, reference: { kind: "instagram_container" as const, id: "../../me" } },
  ])("refuses unsafe input before making any request", async (input) => {
    expect((await observePublication(input)).state).toBe("review");
    expect(network).not.toHaveBeenCalled();
  });
  it.each(Object.keys(inputs).filter((key) => key !== "photo"))(
    "uses safe HTTP boundaries for %s",
    async (key) => {
      network.mockResolvedValue(response({}));
      await observePublication(inputs[key]);
      for (const [url, init] of network.mock.calls) {
        expect(String(url)).not.toContain("QA_SECRET_NOT_SENT");
        expect(new URL(String(url)).protocol).toBe("https:");
        expect(init?.redirect).toBe("error");
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        expect(init?.headers).toMatchObject({ Authorization: "Bearer QA_SECRET_NOT_SENT" });
        expect(init?.method ?? "GET").toBe(key === "tiktok" ? "POST" : "GET");
      }
    },
  );
});
