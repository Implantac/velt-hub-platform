import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  exchange: vi.fn(),
  getProvider: vi.fn(),
  role: "admin" as string | null,
  brand: true,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));
vi.mock("../providers.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../providers.server")>()),
  getProvider: mocks.getProvider,
}));
import { signState, stateCookieName, stateCookieValue } from "../state.server";
import { decryptToken } from "../crypto.server";
import { ProviderConnectionError } from "../providers.server";
import { handleOAuthCallback } from "../callback.server";
const ws = "10000000-0000-4000-8000-000000000001",
  user = "10000000-0000-4000-8000-000000000002",
  brand = "10000000-0000-4000-8000-000000000003",
  attemptId = "10000000-0000-4000-8000-000000000004",
  lease = "10000000-0000-4000-8000-000000000005",
  channelId = "10000000-0000-4000-8000-000000000006";
function request(
  opts: {
    cookie?: boolean;
    provider?: string;
    error?: string;
    brandId?: string;
    code?: string;
    channelId?: string;
  } = {},
) {
  const provider = opts.provider ?? "facebook";
  const state = signState({
    workspaceId: ws,
    userId: user,
    provider,
    brandId: opts.brandId,
    channelId: opts.channelId,
    redirectUri: `https://velt.example/api/public/oauth/callback/${provider}`,
  });
  const url = new URL(`https://velt.example/api/public/oauth/callback/${provider}`);
  url.searchParams.set("state", state);
  if (opts.error) url.searchParams.set("error", opts.error);
  else url.searchParams.set("code", opts.code ?? "authorization-code");
  return new Request(url, {
    headers:
      opts.cookie === false
        ? {}
        : { cookie: `${stateCookieName(provider)}=${stateCookieValue(state)}` },
  });
}
let consumed: boolean;
let consumeOverride: unknown;
let commitOverride: unknown;
let targetExternalId: string | null;
const rpcCalls = (name: string) => mocks.rpc.mock.calls.filter(([key]) => key === name);
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_ORIGIN", "https://velt.example");
  vi.stubEnv("OAUTH_TOKEN_ENC_KEY", Buffer.alloc(32, 8).toString("base64"));
  mocks.role = "admin";
  mocks.brand = true;
  consumed = false;
  consumeOverride = undefined;
  commitOverride = undefined;
  targetExternalId = null;
  mocks.from.mockImplementation((table: string) => {
    const q: Record<string, unknown> = {};
    for (const key of ["select", "eq"]) q[key] = () => q;
    q.maybeSingle = async () => ({
      data:
        table === "workspace_members"
          ? mocks.role
            ? { role: mocks.role }
            : null
          : mocks.brand
            ? { id: brand }
            : null,
      error: null,
    });
    return q;
  });
  mocks.exchange.mockResolvedValue({
    accessToken: "unit-access-secret",
    refreshToken: "unit-refresh-secret",
    externalAccountId: "page-123",
    metadata: { page_id: "page-123" },
  });
  mocks.getProvider.mockReturnValue({ platform: "facebook", exchange: mocks.exchange });
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "consume_oauth_authorization") {
      if (consumeOverride !== undefined) return consumeOverride;
      if (consumed) return { data: null, error: null };
      consumed = true;
      return {
        data: {
          id: attemptId,
          exchange_token: lease,
          state: "exchanging",
          platform: mocks.getProvider().platform,
          workspace_id: ws,
          actor_id: user,
          provider: args._provider,
          target_channel_id: args._channel_id,
          target_external_id: targetExternalId,
        },
        error: null,
      };
    }
    if (name === "complete_oauth_authorization")
      return (
        commitOverride ?? {
          data: {
            id: channelId,
            workspace_id: ws,
            platform: mocks.getProvider().platform,
            external_id: args._external_id,
            status: "connected",
          },
          error: null,
        }
      );
    if (name === "fail_oauth_authorization") return { data: true, error: null };
    throw new Error("Unexpected RPC in callback test");
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("OAuth single-use callback boundary (mock transport, not external homologation)", () => {
  it("requires the initiating browser before touching the provider or database", async () => {
    expect((await handleOAuthCallback(request({ cookie: false }), "facebook")).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects different providers, modified state and duplicated query state", async () => {
    const req = request();
    expect((await handleOAuthCallback(req, "instagram")).status).toBe(400);
    const url = new URL(req.url);
    url.searchParams.set("state", url.searchParams.get("state") + "x");
    expect(
      (await handleOAuthCallback(new Request(url, { headers: req.headers }), "facebook")).status,
    ).toBe(400);
    const duplicate = new URL(req.url);
    duplicate.searchParams.append("state", duplicate.searchParams.get("state")!);
    expect(
      (await handleOAuthCallback(new Request(duplicate, { headers: req.headers }), "facebook"))
        .status,
    ).toBe(400);
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([null, "viewer", "editor"])(
    "rechecks the current role (%s) before any exchange",
    async (role) => {
      mocks.role = role;
      const response = await handleOAuthCallback(request(), "facebook");
      expect(response.headers.get("location")).toContain("oauth_error=connection_failed");
      expect(mocks.exchange).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );
  it("rejects a removed/foreign brand before token exchange", async () => {
    mocks.brand = false;
    await handleOAuthCallback(request({ brandId: brand }), "facebook");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("consumes denial before redirect, does not reflect provider text, and forbids subsequent exchange", async () => {
    const req = request({ error: "secret-provider-error" });
    const response = await handleOAuthCallback(req, "facebook");
    expect(response.headers.get("location")).toBe(
      "https://velt.example/app/channels?oauth_error=provider_denied",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(rpcCalls("fail_oauth_authorization")[0][1]._reason).toBe("provider_denied");
    expect((await handleOAuthCallback(req, "facebook")).headers.get("location")).toContain(
      "authorization_used",
    );
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("consumes malformed code without exchanging, so it cannot be retried with another code", async () => {
    const req = request({ code: "" });
    await handleOAuthCallback(req, "facebook");
    expect(rpcCalls("fail_oauth_authorization")[0][1]._reason).toBe("invalid_response");
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect((await handleOAuthCallback(req, "facebook")).headers.get("location")).toContain(
      "authorization_used",
    );
  });
  it("consumes a signed callback only once across two concurrent requests", async () => {
    const req = request();
    const responses = await Promise.all([
      handleOAuthCallback(req.clone(), "facebook"),
      handleOAuthCallback(req.clone(), "facebook"),
    ]);
    expect(mocks.exchange).toHaveBeenCalledTimes(1);
    expect(rpcCalls("complete_oauth_authorization")).toHaveLength(1);
    expect(
      responses.filter((r) => r.headers.get("location")?.includes("authorization_used")),
    ).toHaveLength(1);
  });
  it.each([
    { data: null, error: { message: "lost acknowledgement" } },
    { data: null, error: null },
    { data: { id: attemptId, exchange_token: lease, state: "pending" }, error: null },
    { data: { id: attemptId, exchange_token: null, state: "exchanging" }, error: null },
  ])("does not exchange without a current acknowledged context: %j", async (result) => {
    consumeOverride = result;
    const response = await handleOAuthCallback(request(), "facebook");
    expect(response.headers.get("location")).toContain("oauth_error=");
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it("stores only the state digest and ciphertext in separate lifecycle RPCs", async () => {
    const req = request({ brandId: brand });
    const response = await handleOAuthCallback(req, "facebook");
    const consume = rpcCalls("consume_oauth_authorization")[0][1];
    expect(consume).toMatchObject({
      _workspace_id: ws,
      _actor_id: user,
      _brand_id: brand,
      _provider: "facebook",
    });
    expect(consume._state_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(consume)).not.toContain("authorization-code");
    const args = rpcCalls("complete_oauth_authorization")[0][1];
    expect(args).toMatchObject({
      _attempt_id: attemptId,
      _exchange_token: lease,
      _external_id: "page-123",
    });
    expect(decryptToken(args._access_ciphertext)).toBe("unit-access-secret");
    expect(decryptToken(args._refresh_ciphertext)).toBe("unit-refresh-secret");
    expect(JSON.stringify(args._metadata)).not.toContain("secret");
    expect(response.headers.get("location")).toBe(
      "https://velt.example/app/channels?oauth_connected=facebook",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(mocks.exchange.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.rpc.mock.invocationCallOrder[0],
    );
  });
  it.each([
    { accessToken: "x" },
    { externalAccountId: "id" },
    { accessToken: " ", externalAccountId: "id" },
    { accessToken: "undefined", externalAccountId: "id" },
    { accessToken: "null", externalAccountId: "id" },
    { accessToken: { secret: true }, externalAccountId: "id" },
    { accessToken: "valid", refreshToken: null, externalAccountId: "id" },
    { accessToken: "valid", externalAccountId: "id", expiresAt: "not-a-date" },
    { accessToken: "valid", externalAccountId: "id", expiresAt: "2000-01-01T00:00:00.000Z" },
    {
      accessToken: "valid",
      externalAccountId: "id",
      metadata: { access_token: "must-not-be-public" },
    },
  ])("never persists invalid token/identity/expiry or public secrets: %j", async (tokens) => {
    mocks.exchange.mockResolvedValue(tokens);
    const response = await handleOAuthCallback(request(), "facebook");
    expect(response.headers.get("location")).toContain("oauth_error=connection_failed");
    expect(rpcCalls("complete_oauth_authorization")).toHaveLength(0);
    expect(rpcCalls("fail_oauth_authorization")).toHaveLength(1);
  });
  it.each([
    { data: null, error: { message: "revoked during exchange" } },
    { data: null, error: null },
    { data: { workspace_id: "other", status: "connected" }, error: null },
    {
      data: {
        id: channelId,
        workspace_id: ws,
        status: "connected",
        platform: "facebook",
        external_id: "wrong-account",
      },
      error: null,
    },
  ])("does not report an unconfirmed/mismatched commit as success: %j", async (result) => {
    commitOverride = result;
    expect((await handleOAuthCallback(request(), "facebook")).headers.get("location")).toContain(
      "oauth_error=connection_failed",
    );
  });
  it("returns only the actionable discovery failure code, without an upstream error body", async () => {
    mocks.exchange.mockRejectedValue(new ProviderConnectionError("account_selection_required"));
    const response = await handleOAuthCallback(request(), "facebook");
    expect(response.headers.get("location")).toContain("oauth_error=account_selection_required");
    expect(rpcCalls("complete_oauth_authorization")).toHaveLength(0);
  });
  it("pins a reconnect to its registered channel/account and rejects a different identity", async () => {
    targetExternalId = "page-existing";
    await handleOAuthCallback(request({ channelId }), "facebook");
    expect(mocks.exchange).toHaveBeenCalledWith(expect.objectContaining({ targetExternalId }));
    expect(rpcCalls("complete_oauth_authorization")).toHaveLength(0);
  });
  it("does not implicitly select an initial GBP location", async () => {
    mocks.getProvider.mockReturnValue({ platform: "google_business", exchange: mocks.exchange });
    mocks.exchange.mockResolvedValue({
      accessToken: "unit-only",
      externalAccountId: "accounts/100",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      metadata: { location_confirmed: false, requires_location_selection: true },
    });
    await handleOAuthCallback(request({ provider: "google_business" }), "google_business");
    const metadata = rpcCalls("complete_oauth_authorization")[0][1]._metadata;
    expect(metadata).toMatchObject({
      location_confirmed: false,
      requires_location_selection: true,
    });
    expect(metadata.location_id).toBeUndefined();
  });
});
