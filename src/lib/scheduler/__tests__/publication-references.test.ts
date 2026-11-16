import { describe, expect, it, vi } from "vitest";
import {
  beforeProviderWrite,
  preservePublicationReference,
  publicationTarget,
  validPublicationReference,
} from "../references";
import type { Platform, PublishInput } from "../contracts";
import { publicationReviewControls } from "@/features/scheduler/reconciliation";

describe("canonical provider targets and references", () => {
  it.each([
    ["facebook", { external_id: "111", page_id: "111" }, "111"],
    ["instagram", { external_id: "222", ig_user_id: "222" }, "222"],
    [
      "google_business",
      { external_id: "accounts/100/locations/200", account_id: "100", location_id: "200" },
      "accounts/100/locations/200",
    ],
    ["linkedin", { external_id: "qa_person" }, "urn:li:person:qa_person"],
    ["linkedin", { external_id: "123", organization_id: "123" }, "urn:li:organization:123"],
    ["linkedin", { external_id: "urn:li:organization:123" }, "urn:li:organization:123"],
    ["youtube", { external_id: "UC_qa_channel" }, "UC_qa_channel"],
    ["tiktok", { external_id: "qa_creator" }, "qa_creator"],
  ] as const)("uses the canonical %s account %j", (platform, config, target) => {
    expect(publicationTarget(platform, config)).toBe(target);
  });
  it.each([
    ["facebook", { external_id: "111", page_id: "999" }],
    ["instagram", { external_id: "222", ig_user_id: "999" }],
    [
      "google_business",
      { external_id: "accounts/100/locations/200", account_id: "999", location_id: "200" },
    ],
    [
      "google_business",
      { external_id: "accounts/100/locations/200", account_id: "100", location_id: "999" },
    ],
    ["linkedin", { external_id: "123", person_id: "999" }],
    ["linkedin", { external_id: "123", organization_id: "999" }],
  ] as const)("refuses an unrelated metadata override %s %j", (platform, config) => {
    expect(() => publicationTarget(platform, config)).toThrow("outra conta");
  });
  it.each([
    ["facebook", { external_id: "../../me" }],
    ["instagram", { external_id: " 123 " }],
    ["google_business", { external_id: "locations/200", account_id: "100", location_id: "200" }],
    ["youtube", {}],
    ["tiktok", { external_id: "https://evil.invalid" }],
    ["x", { external_id: "qa" }],
  ] as const)("fails closed for unsafe/unsupported %s identity %j", (platform, config) => {
    expect(() => publicationTarget(platform as Platform, config)).toThrow("identidade");
  });
  it.each([
    ["facebook", "111", "facebook_post", "111_222", true],
    ["facebook", "111", "facebook_post", "999_222", false],
    ["facebook", "111", "facebook_photo", "222", true],
    ["facebook", "111", "facebook_video", "222", true],
    ["instagram", "111", "instagram_container", "222", true],
    ["instagram", "111", "instagram_media", "222", true],
    ["instagram", "111", "instagram_media", "../../222", false],
    ["instagram", "111", "facebook_post", "111_222", false],
    ["youtube", "UC_qa", "youtube_video", "qaVideo12345", true],
    ["youtube", "UC_qa", "youtube_video", "https://evil.invalid", false],
    ["linkedin", "urn:li:person:qa", "linkedin_post", "urn:li:ugcPost:123", true],
    ["linkedin", "urn:li:person:qa", "linkedin_post", "urn:li:person:qa", false],
    ["tiktok", "qa", "tiktok_publish", "tracking_not_a_public_post", true],
    ["tiktok", "qa", "tiktok_publish", "a?access_token=secret", false],
    [
      "google_business",
      "accounts/1/locations/2",
      "google_local_post",
      "accounts/1/locations/2/localPosts/qa",
      true,
    ],
    [
      "google_business",
      "accounts/1/locations/2",
      "google_local_post",
      "accounts/1/locations/99/localPosts/qa",
      false,
    ],
  ] as const)("validates %s %s %s %s = %s", (platform, target, kind, id, valid) => {
    expect(validPublicationReference(platform, target, { kind, id })).toBe(valid);
  });
  it("does not resume a write before an awaited durable boundary succeeds", async () => {
    let resolve: () => void = () => {};
    const beforeWrite = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    let complete = false;
    const result = beforeProviderWrite({ beforeWrite }).then(() => {
      complete = true;
    });
    await Promise.resolve();
    expect(complete).toBe(false);
    resolve();
    await result;
    expect(complete).toBe(true);
  });
  it("preserves a validated reference when checkpoint acknowledgement is lost", async () => {
    const reference = { kind: "facebook_post" as const, id: "111_222" };
    const checkpoint = vi.fn(async () => {
      throw new Error("database acknowledgement lost");
    });
    await expect(
      preservePublicationReference(
        {
          platform: "facebook",
          channelConfig: { external_id: "111" },
          checkpoint,
        } as unknown as PublishInput,
        reference,
      ),
    ).rejects.toMatchObject({ retryable: false, reference, externalPostId: reference.id });
    expect(checkpoint).toHaveBeenCalledWith(reference);
  });
  it("never stores an invalid reference even if an external response claims success", async () => {
    const checkpoint = vi.fn();
    await expect(
      preservePublicationReference(
        {
          platform: "facebook",
          channelConfig: { external_id: "111" },
          checkpoint,
        } as unknown as PublishInput,
        { kind: "facebook_post", id: "999_222" },
      ),
    ).rejects.toThrow("inválida");
    expect(checkpoint).not.toHaveBeenCalled();
  });
});

describe("scheduler review controls match server leases and cooldowns", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  const at = (offset: number) => new Date(now + offset).toISOString();
  const base = {
    status: "dead_letter" as const,
    reconcile_state: "pending",
    provider_reference: "111_222",
    reconcile_after: at(-1000),
    reconcile_locked_until: null,
    locked_until: null,
    run_at: at(-3600_000),
    created_at: at(-3600_000),
  };
  it("allows only due read-only confirmation while pending", () => {
    expect(publicationReviewControls(base, now)).toMatchObject({
      canCheck: true,
      canClose: false,
      canCancel: false,
    });
  });
  it("allows explicit closing only in review", () => {
    expect(publicationReviewControls({ ...base, reconcile_state: "review" }, now)).toMatchObject({
      canCheck: true,
      canClose: true,
      canCancel: false,
    });
  });
  it.each([
    { reconcile_after: at(1000) },
    { reconcile_after: null },
    { reconcile_after: "invalid" },
    { reconcile_locked_until: at(60_000) },
    { locked_until: at(60_000) },
    { provider_reference: null },
  ])("does not offer an unavailable check %j", (patch) => {
    expect(publicationReviewControls({ ...base, ...patch }, now).canCheck).toBe(false);
  });
  it("a review without a reference can be explicitly closed but not automatically checked", () => {
    expect(
      publicationReviewControls(
        { ...base, reconcile_state: "review", provider_reference: null },
        now,
      ),
    ).toMatchObject({ canCheck: false, canClose: true });
  });
  it("never offers closing while a confirmation worker has a lease", () => {
    expect(
      publicationReviewControls(
        { ...base, reconcile_state: "review", reconcile_locked_until: at(60_000) },
        now,
      ).canClose,
    ).toBe(false);
  });
  it("offers recovery only after the delivery lease plus grace expires", () => {
    expect(
      publicationReviewControls({ ...base, status: "processing", locked_until: at(-31_000) }, now),
    ).toMatchObject({ canCheck: true, expired: true, canCancel: false });
    expect(
      publicationReviewControls({ ...base, status: "processing", locked_until: at(-29_000) }, now)
        .expired,
    ).toBe(false);
  });
  it("uses a ten-minute grace period for old workers without a lease", () => {
    expect(
      publicationReviewControls(
        { ...base, status: "processing", locked_until: null, run_at: at(-601_000) },
        now,
      ).expired,
    ).toBe(true);
  });
  it("does not cancel a dispatched or unconfirmed result", () => {
    expect(
      publicationReviewControls({ ...base, status: "pending", reconcile_state: "none" }, now)
        .canCancel,
    ).toBe(true);
    expect(
      publicationReviewControls({ ...base, status: "pending", reconcile_state: "pending" }, now)
        .canCancel,
    ).toBe(false);
  });
  it.each(["confirmed", "rejected", "closed"])(
    "does not offer automatic actions for %s",
    (reconcile_state) => {
      expect(publicationReviewControls({ ...base, reconcile_state }, now)).toMatchObject({
        canCheck: false,
        canClose: false,
        canCancel: false,
      });
    },
  );
});
