import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  exchange: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: mocks.rpc, from: mocks.from },
}));
vi.mock("../providers.server", () => ({
  getProvider: () => ({ platform: "tiktok", exchange: mocks.exchange }),
  ProviderConnectionError: class extends Error {},
}));
import { getFreshToken } from "../refresh.server";
import { handleOAuthCallback } from "../callback.server";
import { signState, stateCookieName, stateCookieValue } from "../state.server";
import { decryptToken, encryptToken } from "../crypto.server";
import { OAuthCredentialError } from "../errors.server";
import type { Database } from "@/integrations/supabase/types";

type TokenRow = Database["public"]["Tables"]["oauth_tokens"]["Row"];
const workspace = "10000000-0000-4000-8000-000000000001",
  actor = "10000000-0000-4000-8000-000000000002",
  channel = "10000000-0000-4000-8000-000000000003",
  version = "10000000-0000-4000-8000-000000000004",
  lease = "10000000-0000-4000-8000-000000000005",
  attempt = "10000000-0000-4000-8000-000000000006",
  newAuthorization = "10000000-0000-4000-8000-000000000007",
  origin = "https://velt.example";
let token: TokenRow | null,
  status: string,
  intentConsumed: boolean,
  loseBeginAck: boolean,
  loseCommitAck: boolean,
  rejectCommits: number;
const calls = (name: string) => mocks.rpc.mock.calls.filter(([fn]) => fn === name);
const response = (patch: Record<string, unknown> = {}) =>
  Response.json({
    access_token: "QA_NEW_ACCESS",
    refresh_token: "QA_NEW_REFRESH",
    expires_in: 3600,
    ...patch,
  });
function row(overrides: Partial<TokenRow> = {}): TokenRow {
  return {
    id: attempt,
    channel_id: channel,
    access_token_ciphertext: encryptToken("QA_OLD_ACCESS"),
    refresh_token_ciphertext: encryptToken("QA_OLD_REFRESH"),
    expires_at: new Date(Date.now() - 60000).toISOString(),
    token_type: "Bearer",
    scope: "qa.scope",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    token_version: version,
    refresh_lease: null,
    refresh_locked_until: null,
    refresh_started_at: null,
    refresh_retry_after: null,
    refresh_uncertain: false,
    ...overrides,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("OAUTH_TOKEN_ENC_KEY", Buffer.alloc(32, 8).toString("base64"));
  for (const name of [
    "TIKTOK_CLIENT_KEY",
    "TIKTOK_CLIENT_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "LINKEDIN_CLIENT_ID",
    "LINKEDIN_CLIENT_SECRET",
  ])
    vi.stubEnv(name, "QA_INVALID_CLIENT");
  vi.stubGlobal("fetch", mocks.fetch);
  token = row();
  status = "connected";
  intentConsumed = false;
  loseBeginAck = false;
  loseCommitAck = false;
  rejectCommits = 0;
  mocks.from.mockImplementation(() => {
    const q: Record<string, unknown> = {};
    q.select = q.eq = () => q;
    q.maybeSingle = async () => ({ data: { role: "admin" }, error: null });
    return q;
  });
  mocks.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
    if (fn === "read_connected_oauth_token")
      return { data: status === "connected" && token ? { ...token } : null, error: null };
    if (fn === "claim_oauth_token_refresh") {
      let state = "claimed";
      if (!token || status !== "connected") state = "disconnected";
      else if (token.token_version !== args._expected_version) state = "changed";
      else if (token.refresh_locked_until && Date.parse(token.refresh_locked_until) > Date.now())
        state = "busy";
      else if (token.refresh_started_at || token.refresh_uncertain) {
        state = "reconnect";
        status = "expired";
        token.refresh_uncertain = true;
      } else if (token.refresh_retry_after && Date.parse(token.refresh_retry_after) > Date.now())
        state = "cooldown";
      if (state !== "claimed") return { data: { state }, error: null };
      token!.refresh_lease = lease;
      token!.refresh_locked_until = new Date(Date.now() + 60000).toISOString();
      return {
        data: { state, lease, channel_id: channel, token_version: token!.token_version },
        error: null,
      };
    }
    if (fn === "begin_oauth_token_refresh") {
      const ok =
        !!token &&
        status === "connected" &&
        token.token_version === args._expected_version &&
        token.refresh_lease === args._lease &&
        !token.refresh_started_at;
      if (ok) token!.refresh_started_at = new Date().toISOString();
      return loseBeginAck
        ? { data: null, error: { message: "QA begin ack lost" } }
        : { data: ok, error: null };
    }
    if (fn === "complete_oauth_token_refresh") {
      if (rejectCommits-- > 0)
        return { data: null, error: { message: "QA commit temporarily unavailable" } };
      const ok =
        !!token &&
        status === "connected" &&
        token.token_version === args._expected_version &&
        token.refresh_lease === args._lease &&
        !!token.refresh_started_at &&
        !token.refresh_uncertain;
      if (ok)
        token = {
          ...token!,
          token_version: args._new_version as string,
          access_token_ciphertext: args._access_ciphertext as string,
          refresh_token_ciphertext: args._refresh_ciphertext as string,
          expires_at: args._expires_at as string,
          scope: args._scope as string,
          token_type: args._token_type as string,
          refresh_lease: null,
          refresh_started_at: null,
          refresh_locked_until: null,
        };
      return loseCommitAck && ok
        ? { data: null, error: { message: "QA commit ack lost" } }
        : { data: ok, error: null };
    }
    if (fn === "fail_oauth_token_refresh") {
      const ok =
        !!token &&
        status === "connected" &&
        token.token_version === args._expected_version &&
        token.refresh_lease === args._lease;
      if (ok) {
        const uncertain = ["uncertain", "invalid_grant", "invalid_response"].includes(
          String(args._outcome),
        );
        token!.refresh_lease = token!.refresh_started_at = token!.refresh_locked_until = null;
        token!.refresh_uncertain = uncertain;
        token!.refresh_retry_after = uncertain ? null : new Date(Date.now() + 60000).toISOString();
        if (uncertain) status = "expired";
      }
      return { data: ok, error: null };
    }
    if (fn === "invalidate_oauth_token_version") {
      const ok =
        !!token && status === "connected" && token.token_version === args._expected_version;
      if (ok) status = "expired";
      return { data: ok, error: null };
    }
    if (fn === "consume_oauth_authorization") {
      if (intentConsumed) return { data: null, error: null };
      intentConsumed = true;
      return {
        data: {
          id: attempt,
          exchange_token: lease,
          state: "exchanging",
          platform: "tiktok",
          workspace_id: workspace,
          actor_id: actor,
          provider: "tiktok",
          target_channel_id: null,
          target_external_id: null,
        },
        error: null,
      };
    }
    if (fn === "complete_oauth_authorization")
      return {
        data: {
          id: channel,
          workspace_id: workspace,
          platform: "tiktok",
          external_id: "QA_OPEN_ID",
          status: "connected",
        },
        error: null,
      };
    if (fn === "fail_oauth_authorization") return { data: true, error: null };
    throw new Error("Unexpected lifecycle RPC");
  });
  mocks.exchange.mockResolvedValue({
    accessToken: "QA_ACCESS_ONLY",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    externalAccountId: "QA_OPEN_ID",
  });
  mocks.fetch.mockImplementation(async () => response());
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("credential lifecycle regression proofs (synthetic transport/database double; real SQL tested separately)", () => {
  it("exchanges a signed browser-bound callback only once, including concurrent replay", async () => {
    const state = signState({
      workspaceId: workspace,
      userId: actor,
      provider: "tiktok",
      redirectUri: origin + "/api/public/oauth/callback/tiktok",
    });
    const request = new Request(
      origin +
        "/api/public/oauth/callback/tiktok?code=QA_CODE_ONLY&state=" +
        encodeURIComponent(state),
      { headers: { cookie: `${stateCookieName("tiktok")}=${stateCookieValue(state)}` } },
    );
    await Promise.all([
      handleOAuthCallback(request.clone(), "tiktok"),
      handleOAuthCallback(request.clone(), "tiktok"),
    ]);
    expect(mocks.exchange).toHaveBeenCalledTimes(1);
  });
  it("sends one refresh grant across concurrent workers, not an in-memory mutex", async () => {
    const outcomes = await Promise.allSettled([
      getFreshToken(channel, "tiktok"),
      getFreshToken(channel, "tiktok"),
    ]);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((r) => r.status === "rejected")).toMatchObject({
      reason: { code: "refresh_busy", retryable: true },
    });
    expect(calls("claim_oauth_token_refresh")).toHaveLength(2);
  });
  it("never recreates deleted credentials after a late provider refresh response", async () => {
    let finish!: (value: Response) => void;
    mocks.fetch.mockImplementation(() => new Promise<Response>((resolve) => (finish = resolve)));
    const refreshing = getFreshToken(channel, "tiktok");
    const assertion = expect(refreshing).rejects.toMatchObject({ code: "disconnected" });
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    token = null;
    status = "disconnected";
    finish(response());
    await assertion;
    expect(token).toBeNull();
    expect(status).toBe("disconnected");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("cannot overwrite credentials from a newer reauthorization", async () => {
    let finish!: (value: Response) => void;
    mocks.fetch.mockImplementation(() => new Promise<Response>((resolve) => (finish = resolve)));
    const refreshing = getFreshToken(channel, "tiktok");
    const assertion = expect(refreshing).rejects.toMatchObject({
      code: "credential_changed",
      retryable: true,
    });
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    token = row({
      token_version: newAuthorization,
      access_token_ciphertext: encryptToken("QA_REAUTHORIZED"),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    });
    finish(response());
    await assertion;
    expect(decryptToken(token.access_token_ciphertext)).toBe("QA_REAUTHORIZED");
    expect(status).toBe("connected");
  });
  it("requires an acknowledged begin before sending anything to the provider", async () => {
    loseBeginAck = true;
    await expect(getFreshToken(channel, "tiktok")).rejects.toMatchObject({
      code: "credential_changed",
      retryable: true,
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(calls("fail_oauth_token_refresh")[0][1]._outcome).toBe("not_sent");
    expect(status).toBe("connected");
  });
  it("resolves a lost commit acknowledgement using the known new version, without another grant", async () => {
    loseCommitAck = true;
    const fresh = await getFreshToken(channel, "tiktok");
    expect(fresh).toMatchObject({
      refreshed: true,
      accessToken: "QA_NEW_ACCESS",
      version: token!.token_version,
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(calls("complete_oauth_token_refresh")).toHaveLength(1);
    expect(calls("fail_oauth_token_refresh")).toHaveLength(0);
  });
  it("may retry the same CAS write, never the rotating provider grant", async () => {
    rejectCommits = 1;
    await expect(getFreshToken(channel, "tiktok")).resolves.toMatchObject({ refreshed: true });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(calls("complete_oauth_token_refresh")).toHaveLength(2);
    expect(calls("complete_oauth_token_refresh")[0][1]).toEqual(
      calls("complete_oauth_token_refresh")[1][1],
    );
  });
  it("does not claim success or reuse the old grant after an unpersisted rotation", async () => {
    rejectCommits = 10;
    await expect(getFreshToken(channel, "tiktok")).rejects.toMatchObject({
      code: "refresh_uncertain",
      retryable: false,
    });
    expect(status).toBe("expired");
    expect(token!.refresh_uncertain).toBe(true);
    await getFreshToken(channel, "tiktok").catch(() => {});
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, null, 0, -1, false, "3600", {}, 999999999999, 1.5])(
    "rejects missing/nonpositive/noninteger/mistyped expiration %j",
    async (expires_in) => {
      mocks.fetch.mockImplementation(async () => response({ expires_in }));
      await expect(getFreshToken(channel, "tiktok")).rejects.toMatchObject({
        code: "invalid_token",
        retryable: false,
      });
      expect(calls("complete_oauth_token_refresh")).toHaveLength(0);
      expect(status).toBe("expired");
    },
  );
  it.each([undefined, null, "", "undefined", "null", 123, {}, "with spaces", "line\nbreak"])(
    "rejects an invalid refresh access token %j without persisting it",
    async (access_token) => {
      mocks.fetch.mockImplementation(async () => response({ access_token }));
      await expect(getFreshToken(channel, "tiktok")).rejects.toMatchObject({
        code: "invalid_token",
      });
      expect(calls("complete_oauth_token_refresh")).toHaveLength(0);
    },
  );
  it("requires the rotated refresh token in a successful TikTok response", async () => {
    mocks.fetch.mockImplementation(async () => response({ refresh_token: undefined }));
    await expect(getFreshToken(channel, "tiktok")).rejects.toMatchObject({ code: "invalid_token" });
    expect(token!.refresh_uncertain).toBe(true);
  });
  it.each(["youtube", "google_business", "linkedin"])(
    "preserves an omitted refresh token for %s, but uses the validated new expiration",
    async (platform) => {
      mocks.fetch.mockImplementation(async () => response({ refresh_token: undefined }));
      const fresh = await getFreshToken(channel, platform);
      expect(fresh.refreshed).toBe(true);
      expect(decryptToken(token!.refresh_token_ciphertext!)).toBe("QA_OLD_REFRESH");
      expect(calls("complete_oauth_token_refresh")[0][1]._expires_at).toBeTruthy();
    },
  );
  it("persists rotated tokens only encrypted and carries no token in RPC metadata/events", async () => {
    const fresh = await getFreshToken(channel, "tiktok");
    expect(fresh.version).not.toBe(version);
    const args = calls("complete_oauth_token_refresh")[0][1];
    expect(JSON.stringify(args)).not.toContain("QA_NEW_");
    expect(decryptToken(args._refresh_ciphertext)).toBe("QA_NEW_REFRESH");
    const init = mocks.fetch.mock.calls[0][1];
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.body).toContain("grant_type=refresh_token");
  });
  it("keeps a 429 refusal in bounded cooldown, not false connected/expired transitions or a second grant", async () => {
    mocks.fetch.mockImplementation(async () => new Response("QA_SENSITIVE_BODY", { status: 429 }));
    await expect(getFreshToken(channel, "tiktok")).rejects.toMatchObject({
      code: "refresh_cooldown",
      retryable: true,
    });
    expect(status).toBe("connected");
    await expect(getFreshToken(channel, "tiktok")).rejects.toMatchObject({
      code: "refresh_cooldown",
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it.each(["network", "server", "invalid-json"])(
    "does not retry an ambiguous %s response or expose its body",
    async (mode) => {
      mocks.fetch.mockImplementation(async () => {
        if (mode === "network") throw new Error("QA_SENSITIVE_BODY");
        return new Response("QA_SENSITIVE_BODY", { status: mode === "server" ? 503 : 200 });
      });
      const error = await getFreshToken(channel, "tiktok").catch((e) => e);
      expect(error).toBeInstanceOf(OAuthCredentialError);
      expect(error.retryable).toBe(false);
      expect(error.message).not.toContain("QA_SENSITIVE_BODY");
      expect(status).toBe("expired");
      await getFreshToken(channel, "tiktok").catch(() => {});
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    },
  );
  it.each([200, 400])(
    "recognizes a documented invalid_grant response at HTTP %s without logging its description",
    async (http) => {
      mocks.fetch.mockImplementation(async () =>
        Response.json(
          { error: "invalid_grant", error_description: "QA_SENSITIVE_BODY" },
          { status: http },
        ),
      );
      await expect(getFreshToken(channel, "tiktok")).rejects.toMatchObject({
        code: "invalid_grant",
        retryable: false,
      });
      expect(status).toBe("expired");
    },
  );
  it("does not send a grant when required application configuration is absent", async () => {
    vi.stubEnv("TIKTOK_CLIENT_SECRET", "");
    await expect(getFreshToken(channel, "tiktok")).rejects.toMatchObject({
      code: "provider_configuration",
      retryable: true,
    });
    expect(calls("claim_oauth_token_refresh")).toHaveLength(0);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(status).toBe("connected");
  });
  it("requires reauthorization for an expired Meta Page grant rather than exchanging it as a user token", async () => {
    await expect(getFreshToken(channel, "facebook")).rejects.toMatchObject({
      code: "missing_refresh",
      retryable: false,
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(status).toBe("expired");
    expect(calls("invalidate_oauth_token_version")[0][1]._expected_version).toBe(version);
  });
  it("uses an unknown-lifetime Page credential but never an unknown-lifetime Google access token without refresh", async () => {
    token!.expires_at = null;
    expect(await getFreshToken(channel, "facebook")).toMatchObject({ refreshed: false });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(await getFreshToken(channel, "youtube")).toMatchObject({ refreshed: true });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it("fails closed for an invalid persisted expiration rather than treating it as never expiring", async () => {
    token!.expires_at = "not-a-date";
    await expect(getFreshToken(channel, "tiktok")).rejects.toMatchObject({ code: "invalid_token" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
