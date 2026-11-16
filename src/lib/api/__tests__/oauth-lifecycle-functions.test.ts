import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
type Handler = (input: {
  data: unknown;
  context: { userId: string; supabase: unknown };
}) => Promise<unknown>;
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (data: unknown) => data;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof parse) => {
        parse = fn;
        return builder;
      },
      handler: (fn: Handler) => (input: Parameters<Handler>[0]) =>
        fn({ ...input, data: parse(input.data) }),
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const mocks = vi.hoisted(() => ({
  adminRpc: vi.fn(),
  token: vi.fn(),
  locations: vi.fn(),
  provider: vi.fn(),
  cookie: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: mocks.adminRpc },
}));
vi.mock("@/lib/oauth/refresh.server", () => ({ getFreshToken: mocks.token }));
vi.mock("@/lib/oauth/providers.server", () => ({
  getProvider: mocks.provider,
  listProviders: () => ["google_business"],
  listBusinessLocations: mocks.locations,
}));
vi.mock("@tanstack/react-start/server", () => ({
  setCookie: mocks.cookie,
  getRequest: () =>
    new Request("http://dev.example.invalid/app/channels", {
      headers: { "x-forwarded-host": "attacker.invalid", "x-forwarded-proto": "https" },
    }),
}));
import { startOAuthConnect, disconnectChannel } from "../oauth.functions";
import { listBusinessLocationsForChannel, selectBusinessLocation } from "../gbp.functions";
import { stateCookieValue, verifyState } from "@/lib/oauth/state.server";
const ws = "10000000-0000-4000-8000-000000000001",
  user = "10000000-0000-4000-8000-000000000002",
  channelId = "10000000-0000-4000-8000-000000000003",
  brandId = "10000000-0000-4000-8000-000000000004",
  version = "10000000-0000-4000-8000-000000000005",
  attemptId = "10000000-0000-4000-8000-000000000006";
const target = {
  id: channelId,
  workspace_id: ws,
  platform: "google_business",
  external_id: "accounts/100",
  brand_id: brandId,
  status: "connected",
  metadata: {},
};
const location = {
  name: "accounts/100/locations/200",
  accountId: "100",
  locationId: "200",
  locationName: "QA Unit",
  verified: true,
};
function fixture(
  options: { role?: string | null; channel?: unknown; rpc?: unknown; readError?: string } = {},
) {
  const from = vi.fn((table: string) => {
    const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    q.select.mockReturnValue(q);
    q.eq.mockReturnValue(q);
    q.maybeSingle.mockResolvedValue({
      data:
        table === "workspace_members"
          ? options.role === null
            ? null
            : { role: options.role ?? "owner" }
          : table === "brands"
            ? { id: brandId }
            : options.channel === undefined
              ? target
              : options.channel,
      error: options.readError ? { message: options.readError } : null,
    });
    return q;
  });
  const rpc = vi.fn(
    async (name: string, _args: Record<string, unknown>) =>
      options.rpc ?? {
        data:
          name === "register_oauth_authorization"
            ? attemptId
            : { ...target, status: "disconnected" },
        error: null,
      },
  );
  return { from, rpc, context: { userId: user, supabase: { from, rpc } } };
}
const invoke = (fn: unknown, data: unknown, f = fixture()) =>
  (fn as Handler)({ data, context: f.context });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_ORIGIN", "https://velt.example");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("OAUTH_TOKEN_ENC_KEY", Buffer.alloc(32, 9).toString("base64"));
  mocks.provider.mockReturnValue({
    platform: "google_business",
    authUrl: ({ state, redirectUri }: { state: string; redirectUri: string }) =>
      `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
  });
  mocks.token.mockResolvedValue({ accessToken: "QA_TOKEN_NEVER_SENT", version, refreshed: false });
  mocks.locations.mockResolvedValue([location]);
  mocks.adminRpc.mockResolvedValue({
    data: { ...target, external_id: location.name },
    error: null,
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("OAuth server functions register before redirecting", () => {
  it("registers only a digest bound to actor/workspace/provider/expiry before setting a browser cookie", async () => {
    const f = fixture();
    const result = (await invoke(
      startOAuthConnect,
      { workspaceId: ws, provider: "google_business" },
      f,
    )) as { url: string };
    const state = new URL(result.url).searchParams.get("state")!;
    const payload = verifyState(state);
    expect(payload).toMatchObject({
      workspaceId: ws,
      userId: user,
      provider: "google_business",
      brandId: null,
      channelId: null,
      redirectUri: "https://velt.example/api/public/oauth/callback/google_business",
    });
    expect(f.rpc).toHaveBeenCalledWith(
      "register_oauth_authorization",
      expect.objectContaining({
        _workspace_id: ws,
        _provider: "google_business",
        _platform: "google_business",
        _state_hash: stateCookieValue(state),
        _expires_at: new Date(payload.exp * 1000).toISOString(),
        _channel_id: null,
      }),
    );
    expect(JSON.stringify(f.rpc.mock.calls)).not.toContain(state);
    expect(mocks.cookie).toHaveBeenCalledWith(
      "velt_oauth_google_business",
      stateCookieValue(state),
      expect.objectContaining({ secure: true, httpOnly: true, sameSite: "lax", maxAge: 600 }),
    );
    expect(mocks.cookie.mock.invocationCallOrder[0]).toBeGreaterThan(
      f.rpc.mock.invocationCallOrder[0],
    );
  });
  it("pins a reconnect to its channel and preserves the existing brand in state/registration", async () => {
    const f = fixture();
    const result = (await invoke(
      startOAuthConnect,
      { workspaceId: ws, provider: "google_business", channelId },
      f,
    )) as { url: string };
    const state = new URL(result.url).searchParams.get("state")!;
    expect(verifyState(state)).toMatchObject({ brandId, channelId });
    expect(f.rpc.mock.calls[0][0]).toBe("register_oauth_authorization");
    expect(f.rpc.mock.calls[0][1]).toMatchObject({ _channel_id: channelId, _brand_id: brandId });
    const query = f.from.mock.results.find(
      (_, index) => f.from.mock.calls[index][0] === "channels",
    )!.value;
    expect(query.eq).toHaveBeenCalledWith("workspace_id", ws);
  });
  it.each([
    null,
    { data: null, error: null },
    { data: "not-a-uuid", error: null },
    { data: null, error: { message: "registration unavailable" } },
  ])(
    "does not set a cookie or return an authorization URL without confirmed registration: %j",
    async (rpc) => {
      const f = fixture({ rpc: rpc ?? { data: null, error: null } });
      await expect(
        invoke(startOAuthConnect, { workspaceId: ws, provider: "google_business" }, f),
      ).rejects.toThrow();
      expect(mocks.cookie).not.toHaveBeenCalled();
    },
  );
  it.each([null, "editor", "viewer"])("denies %s before signing/registering", async (role) => {
    const f = fixture({ role });
    await expect(
      invoke(startOAuthConnect, { workspaceId: ws, provider: "google_business" }, f),
    ).rejects.toThrow("forbidden");
    expect(f.rpc).not.toHaveBeenCalled();
    expect(mocks.cookie).not.toHaveBeenCalled();
  });
  it.each([null, { ...target, platform: "youtube" }, { ...target, external_id: null }])(
    "rejects an unavailable/wrong-platform/manual reconnect target: %j",
    async (channel) => {
      const f = fixture({ channel });
      await expect(
        invoke(startOAuthConnect, { workspaceId: ws, provider: "google_business", channelId }, f),
      ).rejects.toThrow("reconexão");
      expect(f.rpc).not.toHaveBeenCalled();
    },
  );
  it.each([
    "",
    "http://velt.example",
    "https://user:pass@velt.example",
    "https://velt.example/path",
    "https://velt.example?x=1",
    "https://velt.example#hash",
  ])("fails closed for an absent/untrusted production APP_ORIGIN %j", async (origin) => {
    vi.stubEnv("APP_ORIGIN", origin);
    await expect(
      invoke(startOAuthConnect, { workspaceId: ws, provider: "google_business" }),
    ).rejects.toThrow("APP_ORIGIN");
    expect(mocks.cookie).not.toHaveBeenCalled();
  });
  it("uses the request URL only in development, never attacker-supplied forwarded headers", async () => {
    vi.stubEnv("APP_ORIGIN", "");
    vi.stubEnv("NODE_ENV", "development");
    const result = (await invoke(startOAuthConnect, {
      workspaceId: ws,
      provider: "google_business",
    })) as { url: string };
    expect(verifyState(new URL(result.url).searchParams.get("state")!).redirectUri).toBe(
      "http://dev.example.invalid/api/public/oauth/callback/google_business",
    );
  });
  it("only reports disconnect after the database confirms the same disconnected channel", async () => {
    const f = fixture();
    await expect(invoke(disconnectChannel, { channelId }, f)).resolves.toMatchObject({
      id: channelId,
      status: "disconnected",
    });
    expect(f.rpc).toHaveBeenCalledWith("disconnect_oauth_channel", { _channel_id: channelId });
  });
  it.each([null, { ...target }, { ...target, id: attemptId, status: "disconnected" }])(
    "does not report an unconfirmed disconnect: %j",
    async (data) => {
      await expect(
        invoke(disconnectChannel, { channelId }, fixture({ rpc: { data, error: null } })),
      ).rejects.toThrow("confirmada");
    },
  );
});
describe("GBP explicit binding uses fresh provider evidence and a versioned privileged RPC", () => {
  const data = { workspaceId: ws, channelId, locationName: location.name };
  it("binds a freshly discovered current Voice of Merchant location using the exact credential version", async () => {
    const f = fixture();
    await expect(invoke(selectBusinessLocation, data, f)).resolves.toEqual({ ok: true, location });
    expect(mocks.adminRpc).toHaveBeenCalledWith("bind_google_business_location", {
      _workspace_id: ws,
      _actor_id: user,
      _channel_id: channelId,
      _expected_version: version,
      _location_reference: location.name,
      _location_name: location.locationName,
      _address: null,
    });
    expect(f.rpc).not.toHaveBeenCalled();
    expect(mocks.locations).toHaveBeenCalledWith("QA_TOKEN_NEVER_SENT");
  });
  it.each([
    { locations: [], message: "não está entre" },
    { locations: [{ ...location, verified: false }], message: "ainda não está verificada" },
  ])(
    "does not bind missing or currently unauthorized locations: %j",
    async ({ locations, message }) => {
      mocks.locations.mockResolvedValue(locations);
      await expect(invoke(selectBusinessLocation, data)).rejects.toThrow(message);
      expect(mocks.adminRpc).not.toHaveBeenCalled();
    },
  );
  it.each(["editor", "viewer"])("does not even read the credential for %s", async (role) => {
    await expect(invoke(selectBusinessLocation, data, fixture({ role }))).rejects.toThrow(
      "forbidden",
    );
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });
  it("does not turn a provider discovery error into an empty success", async () => {
    mocks.locations.mockRejectedValue(new Error("provider unavailable"));
    await expect(invoke(selectBusinessLocation, data)).rejects.toThrow();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });
  it("propagates a stale credential fencing failure instead of reporting a unit as bound", async () => {
    mocks.adminRpc.mockResolvedValue({
      data: null,
      error: { code: "40001", message: "A autorização mudou" },
    });
    await expect(invoke(selectBusinessLocation, data)).rejects.toThrow("autorização mudou");
  });
  it.each([
    null,
    { ...target },
    { ...target, id: attemptId, external_id: location.name },
    { ...target, workspace_id: attemptId, external_id: location.name },
  ])("does not report an unconfirmed/wrong-channel unit update: %j", async (row) => {
    mocks.adminRpc.mockResolvedValue({ data: row, error: null });
    await expect(invoke(selectBusinessLocation, data)).rejects.toThrow("não confirmada");
  });
  it("filters discovery to the explicitly authorized business account", async () => {
    mocks.locations.mockResolvedValue([
      location,
      { ...location, name: "accounts/999/locations/999", accountId: "999", locationId: "999" },
    ]);
    await expect(
      invoke(listBusinessLocationsForChannel, { workspaceId: ws, channelId }),
    ).resolves.toEqual({ locations: [location], verifiedCount: 1 });
  });
});
