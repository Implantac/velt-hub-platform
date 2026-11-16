import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), token: vi.fn(), collect: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));
vi.mock("@/lib/oauth/refresh.server", () => ({ getFreshToken: mocks.token }));
vi.mock("../insights.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../insights.server")>()),
  collectorFor: () => mocks.collect,
}));
import { runAnalyticsSync } from "../sync.server";
import { InsightAuthError } from "../insights.server";
const ws = "10000000-0000-4000-8000-000000000001",
  channel = "10000000-0000-4000-8000-000000000002",
  oldVersion = "10000000-0000-4000-8000-000000000003",
  newVersion = "10000000-0000-4000-8000-000000000004";
let currentVersion: string, channelStatus: string;
const updates: Array<[string, unknown]> = [];
beforeEach(() => {
  vi.clearAllMocks();
  updates.length = 0;
  currentVersion = oldVersion;
  channelStatus = "connected";
  mocks.token.mockResolvedValue({
    accessToken: "QA_TOKEN_NOT_SENT",
    version: oldVersion,
    refreshed: false,
  });
  mocks.collect.mockRejectedValue(new InsightAuthError("QA_UPSTREAM_SENSITIVE_BODY"));
  mocks.rpc.mockImplementation(async (_name: string, args: { _expected_version: string }) => {
    const matched = args._expected_version === currentVersion && channelStatus === "connected";
    if (matched) channelStatus = "expired";
    return { data: matched, error: null };
  });
  mocks.from.mockImplementation((table: string) => {
    const data =
      table === "channels"
        ? [
            {
              id: channel,
              workspace_id: ws,
              platform: "facebook",
              external_id: "100",
              metadata: {},
              status: "connected",
            },
          ]
        : table === "scheduler_jobs"
          ? [
              {
                id: "qa-job",
                channel_id: channel,
                content_id: "qa-content",
                external_post_id: "100_200",
                workspace_id: ws,
                scheduled_at: new Date().toISOString(),
              },
            ]
          : [];
    const q: Record<string, unknown> = {};
    for (const key of ["select", "eq", "not", "gte", "order", "limit"]) q[key] = () => q;
    q.update = (value: unknown) => {
      updates.push([table, value]);
      return q;
    };
    q.then = (resolve: (value: unknown) => void) =>
      Promise.resolve({ data, error: null }).then(resolve);
    return q;
  });
});
describe("analytics authentication invalidation is credential-version fenced", () => {
  it("invalidates only the exact token version used by the collector and never writes status/metadata directly", async () => {
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(mocks.rpc).toHaveBeenCalledWith("invalidate_oauth_token_version", {
      _channel_id: channel,
      _expected_version: oldVersion,
      _issue: "provider_unauthorized",
    });
    expect(channelStatus).toBe("expired");
    expect(updates).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("QA_UPSTREAM_SENSITIVE_BODY");
  });
  it("cannot expire a newer reauthorization when a slow collector returns an old 401", async () => {
    mocks.collect.mockImplementation(async () => {
      currentVersion = newVersion;
      throw new InsightAuthError("QA_OLD_401");
    });
    await runAnalyticsSync({ workspaceId: ws });
    expect(channelStatus).toBe("connected");
    expect(updates).toEqual([]);
    expect(mocks.rpc.mock.calls[0][1]._expected_version).toBe(oldVersion);
  });
  it("does not claim a confirmed invalidation when persistence failed", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "QA_DATABASE_PRIVATE_DETAILS" } });
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(channelStatus).toBe("connected");
    expect(result.errors[0].error).toContain("não foi possível confirmar");
    expect(JSON.stringify(result)).not.toContain("QA_DATABASE_PRIVATE_DETAILS");
  });
});
