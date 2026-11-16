import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { getProvider, listBusinessLocations } from "../providers.server";
const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  for (const name of [
    "META_APP_ID",
    "META_APP_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "LINKEDIN_CLIENT_ID",
    "LINKEDIN_CLIENT_SECRET",
  ])
    vi.stubEnv(name, "unit-test-only");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const args = {
  code: "unit-code",
  redirectUri: "https://velt.example/api/public/oauth/callback/test",
};
describe("resource discovery contracts (network fully mocked)", () => {
  it("encryptable Meta credential is the Page token, never the user token or public metadata", async () => {
    fetchMock.mockResolvedValueOnce(json({ access_token: "user-secret" })).mockResolvedValueOnce(
      json({
        data: [
          {
            id: "page",
            name: "The Page",
            access_token: "page-secret",
            instagram_business_account: { id: "ig", username: "ig-name" },
          },
        ],
      }),
    );
    const result = await getProvider("instagram").exchange(args);
    expect(result).toMatchObject({
      accessToken: "page-secret",
      externalAccountId: "ig",
      metadata: { page_id: "page", ig_user_id: "ig" },
    });
    expect(JSON.stringify(result.metadata)).not.toContain("secret");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v24.0/");
  });
  it("rejects ambiguous Meta account selection instead of publishing to the first Page", async () => {
    fetchMock.mockResolvedValueOnce(json({ access_token: "user" })).mockResolvedValueOnce(
      json({
        data: [
          { id: "a", access_token: "a" },
          { id: "b", access_token: "b" },
        ],
      }),
    );
    await expect(getProvider("facebook").exchange(args)).rejects.toMatchObject({
      code: "account_selection_required",
    });
  });
  it("does not treat a missing Instagram business account as a connected publishing resource", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "user" }))
      .mockResolvedValueOnce(json({ data: [{ id: "page", access_token: "token" }] }));
    await expect(getProvider("instagram").exchange(args)).rejects.toMatchObject({
      code: "no_eligible_account",
    });
  });
  it("discovers the real YouTube channel ID after token exchange", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "youtube", expires_in: 3600 }))
      .mockResolvedValueOnce(
        json({ items: [{ id: "channel-real", snippet: { title: "The Channel" } }] }),
      );
    expect(await getProvider("youtube").exchange(args)).toMatchObject({
      externalAccountId: "channel-real",
      externalHandle: "The Channel",
    });
  });
  it("discovers the LinkedIn author instead of fabricating an OAuth timestamp identity", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "linkedin", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ sub: "person-real", name: "Person" }));
    expect(await getProvider("linkedin").exchange(args)).toMatchObject({
      externalAccountId: "person-real",
      metadata: { person_id: "person-real" },
    });
  });
  it("uses VoiceOfMerchant, not location existence or canOperateLocalServices, as the verification gate", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ accounts: [{ name: "accounts/100" }] }))
      .mockResolvedValueOnce(
        json({
          locations: [
            {
              name: "locations/200",
              title: "Same name",
              metadata: { canOperateLocalServices: true },
            },
            { name: "locations/201", title: "Same name" },
          ],
        }),
      )
      .mockResolvedValueOnce(json({ hasVoiceOfMerchant: false }))
      .mockResolvedValueOnce(json({ hasVoiceOfMerchant: true }));
    const rows = await listBusinessLocations("unit-token");
    expect(rows.map((r) => [r.name, r.verified])).toEqual([
      ["accounts/100/locations/200", false],
      ["accounts/100/locations/201", true],
    ]);
    expect(String(fetchMock.mock.calls[2][0])).toContain("/locations/200/VoiceOfMerchantState");
  });
  it("paginates both GBP accounts and locations rather than silently losing branches", async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({ accounts: [{ name: "accounts/100" }], nextPageToken: "accounts-next" }),
      )
      .mockResolvedValueOnce(json({ accounts: [] }))
      .mockResolvedValueOnce(
        json({ locations: [{ name: "locations/200" }], nextPageToken: "locations-next" }),
      )
      .mockResolvedValueOnce(json({ hasVoiceOfMerchant: true }))
      .mockResolvedValueOnce(json({ locations: [{ name: "locations/201" }] }))
      .mockResolvedValueOnce(json({ hasVoiceOfMerchant: true }));
    expect(await listBusinessLocations("unit-token")).toHaveLength(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("pageToken=accounts-next");
    expect(String(fetchMock.mock.calls[4][0])).toContain("pageToken=locations-next");
  });
  it("does not silently return a partial/empty GBP list when a provider read fails", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ accounts: [{ name: "accounts/100" }] }))
      .mockResolvedValueOnce(json({ error: "upstream-sensitive-body" }, 403));
    await expect(listBusinessLocations("unit-token")).rejects.toMatchObject({
      code: "provider_unavailable",
    });
  });
  it("does not automatically bind the first GBP branch after OAuth", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "google", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ accounts: [{ name: "accounts/100" }] }))
      .mockResolvedValueOnce(json({ locations: [{ name: "locations/200", title: "One" }] }))
      .mockResolvedValueOnce(json({ hasVoiceOfMerchant: true }));
    expect(await getProvider("google_business").exchange(args)).toMatchObject({
      externalAccountId: "accounts/100",
      metadata: { requires_location_selection: true, location_confirmed: false },
    });
  });
});

describe("OAuth lifecycle discovery hardening (synthetic HTTP only)", () => {
  it("reconnects the requested Meta Page among several without retargeting to the first", async () => {
    fetchMock.mockResolvedValueOnce(json({ access_token: "user" })).mockResolvedValueOnce(
      json({
        data: [
          { id: "first", access_token: "QA_FIRST" },
          { id: "chosen", access_token: "QA_CHOSEN" },
        ],
      }),
    );
    const result = await getProvider("facebook").exchange({ ...args, targetExternalId: "chosen" });
    expect(result).toMatchObject({ externalAccountId: "chosen", accessToken: "QA_CHOSEN" });
    expect(JSON.stringify(result.metadata)).not.toContain("QA_CHOSEN");
  });
  it("paginates Pages using its own endpoint/cursor, never following an upstream next URL with secrets", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "QA_USER" }))
      .mockResolvedValueOnce(
        json({
          data: [{ id: "first", access_token: "QA_FIRST" }],
          paging: { next: "https://attacker.invalid/leak", cursors: { after: "qa-next" } },
        }),
      )
      .mockResolvedValueOnce(json({ data: [{ id: "chosen", access_token: "QA_CHOSEN" }] }));
    expect(
      await getProvider("facebook").exchange({ ...args, targetExternalId: "chosen" }),
    ).toMatchObject({ externalAccountId: "chosen" });
    expect(String(fetchMock.mock.calls[2][0])).toContain("graph.facebook.com/");
    expect(String(fetchMock.mock.calls[2][0])).toContain("after=qa-next");
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("attacker.invalid"))).toBe(
      true,
    );
  });
  it("reconnects the same previously chosen GBP unit, checking current Voice of Merchant", async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({ access_token: "QA_GOOGLE", expires_in: 3600, refresh_token: "QA_REFRESH" }),
      )
      .mockResolvedValueOnce(json({ accounts: [{ name: "accounts/100" }] }))
      .mockResolvedValueOnce(
        json({ locations: [{ name: "locations/200", title: "Previously chosen" }] }),
      )
      .mockResolvedValueOnce(json({ hasVoiceOfMerchant: true }));
    expect(
      await getProvider("google_business").exchange({
        ...args,
        targetExternalId: "accounts/100/locations/200",
      }),
    ).toMatchObject({
      externalAccountId: "accounts/100/locations/200",
      metadata: {
        location_id: "200",
        account_id: "100",
        requires_location_selection: false,
        location_confirmed: true,
      },
    });
  });
  it("cannot reconnect a GBP unit for which Voice of Merchant is no longer granted", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "QA_GOOGLE", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ accounts: [{ name: "accounts/100" }] }))
      .mockResolvedValueOnce(json({ locations: [{ name: "locations/200" }] }))
      .mockResolvedValueOnce(json({ hasVoiceOfMerchant: false }));
    await expect(
      getProvider("google_business").exchange({
        ...args,
        targetExternalId: "accounts/100/locations/200",
      }),
    ).rejects.toMatchObject({ code: "no_eligible_account" });
  });
  it("never guesses the first GBP business account when a grant can manage several", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "QA_GOOGLE", expires_in: 3600 }))
      .mockResolvedValueOnce(
        json({ accounts: [{ name: "accounts/100" }, { name: "accounts/999" }] }),
      )
      .mockResolvedValueOnce(json({ locations: [{ name: "locations/200" }] }))
      .mockResolvedValueOnce(json({ hasVoiceOfMerchant: true }))
      .mockResolvedValueOnce(json({ locations: [{ name: "locations/999" }] }))
      .mockResolvedValueOnce(json({ hasVoiceOfMerchant: true }));
    await expect(getProvider("google_business").exchange(args)).rejects.toMatchObject({
      code: "account_selection_required",
    });
  });
  it("detects a repeated pagination cursor rather than looping forever", async () => {
    fetchMock.mockImplementation(async () => json({ accounts: [], nextPageToken: "loop" }));
    await expect(listBusinessLocations("QA_TOKEN")).rejects.toMatchObject({
      code: "provider_unavailable",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(["toString", "constructor", "__proto__"])(
    "does not accept the inherited provider property %s",
    (provider) => {
      expect(() => getProvider(provider)).toThrow("Unsupported");
    },
  );
  it.each([undefined, null, "", "undefined", 123, {}])(
    "does not use an invalid OAuth access token for discovery: %j",
    async (access_token) => {
      fetchMock.mockResolvedValueOnce(json({ access_token, expires_in: 3600 }));
      await expect(getProvider("youtube").exchange(args)).rejects.toMatchObject({
        code: "provider_unavailable",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it.each([undefined, null, -1, 0, "3600", 1.2, 999999999999])(
    "does not store an unstated/malformed Google expiration as a never-expiring token: %j",
    async (expires_in) => {
      fetchMock.mockResolvedValueOnce(json({ access_token: "QA_VALID", expires_in }));
      await expect(getProvider("youtube").exchange(args)).rejects.toMatchObject({
        code: "provider_unavailable",
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it("does not reflect sensitive token-exchange error bodies", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "QA_CLIENT_SECRET_MUST_NOT_LEAK" }, 400));
    const error = await getProvider("linkedin")
      .exchange(args)
      .catch((value) => value);
    expect(error.message).toBe("provider_unavailable");
    expect(error.message).not.toContain("QA_CLIENT_SECRET");
  });
  it("stops an oversized discovery body, cancels its stream and never reflects it", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("QA_SECRET_" + "x".repeat(1_048_576)));
      },
      cancel,
    });
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "QA_GOOGLE", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response(body));
    const error = await getProvider("youtube")
      .exchange(args)
      .catch((value) => value);
    expect(error.message).toBe("provider_unavailable");
    expect(error.message).not.toContain("QA_SECRET");
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("allows a bounded discovery page larger than the token-exchange limit", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "QA_GOOGLE", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ items: [{ id: "QA_CHANNEL" }], ignored: "x".repeat(131_073) }));
    await expect(getProvider("youtube").exchange(args)).resolves.toMatchObject({
      externalAccountId: "QA_CHANNEL",
    });
  });
  it("bounds every exchange/discovery request and rejects redirects", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "QA_GOOGLE", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ accounts: [{ name: "accounts/100" }] }))
      .mockResolvedValueOnce(json({ locations: [{ name: "locations/200" }] }))
      .mockResolvedValueOnce(json({ hasVoiceOfMerchant: true }));
    await getProvider("google_business").exchange(args);
    expect(fetchMock.mock.calls).toHaveLength(4);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.redirect).toBe("error");
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });
});
