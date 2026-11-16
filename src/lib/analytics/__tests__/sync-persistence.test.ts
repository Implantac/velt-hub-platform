import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), token: vi.fn(), collect: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));
vi.mock("@/lib/oauth/refresh.server", () => ({ getFreshToken: mocks.token }));
vi.mock("../insights.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../insights.server")>();
  return {
    ...actual,
    collectorFor: (platform: string) => (actual.collectorFor(platform) ? mocks.collect : null),
  };
});
import { runAnalyticsSync } from "../sync.server";
import { EMPTY_METRICS } from "../normalize";
const ws = "60000000-0000-4000-8000-000000000001";
const channel = "60000000-0000-4000-8000-000000000002";
const version = "60000000-0000-4000-8000-000000000003";
const jobId = "60000000-0000-4000-8000-000000000004";
const contentId = "60000000-0000-4000-8000-000000000005";
const snapshotId = "60000000-0000-4000-8000-000000000006";
const privateError = { code: "42501", message: "QA_PRIVATE_DATABASE_DETAILS" };
let platform: string;
let persistError: boolean;
let jobReadError: boolean;
let jobs: Array<Record<string, unknown>>;
const writes: Array<{ table: string; value: unknown }> = [];
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  platform = "facebook";
  persistError = false;
  jobReadError = false;
  writes.length = 0;
  jobs = [
    {
      id: jobId,
      channel_id: channel,
      content_id: contentId,
      external_post_id: "QA_R6_POST_NEVER_SENT",
      workspace_id: ws,
      scheduled_at: new Date().toISOString(),
    },
  ];
  mocks.token.mockResolvedValue({
    accessToken: "QA_R6_TOKEN_NEVER_SENT",
    version,
    refreshed: false,
  });
  mocks.collect.mockResolvedValue({
    metrics: {
      ...EMPTY_METRICS,
      impressions: 100,
      likes: 10,
      engagement: 10,
      engagement_rate: 0.1,
    },
  });
  mocks.rpc.mockImplementation(async () =>
    persistError
      ? { data: null, error: privateError }
      : {
          data: { accepted: true, snapshot_id: snapshotId, captured_at: new Date().toISOString() },
          error: null,
        },
  );
  mocks.from.mockImplementation((table: string) => {
    let mutation = false;
    const q: Record<string, unknown> = {};
    for (const method of ["select", "eq", "not", "gte", "order", "limit"]) q[method] = () => q;
    q.maybeSingle = async () => ({ data: null, error: null });
    for (const method of ["insert", "update"])
      q[method] = (value: unknown) => {
        mutation = true;
        writes.push({ table, value });
        return q;
      };
    q.then = (resolve: (value: unknown) => void) =>
      Promise.resolve({
        data: mutation
          ? null
          : table === "channels"
            ? [
                {
                  id: channel,
                  workspace_id: ws,
                  platform,
                  external_id: "QA_R6_ACCOUNT",
                  metadata: {},
                  status: "connected",
                },
              ]
            : table === "scheduler_jobs"
              ? jobs
              : [],
        error:
          table === "scheduler_jobs" && jobReadError
            ? privateError
            : table === "analytics_snapshots" && mutation && persistError
              ? privateError
              : null,
      }).then(resolve);
    return q;
  });
});
afterEach(() => vi.restoreAllMocks());

describe("analytics persistence must be acknowledged and fenced", () => {
  it.each(["tiktok", "google_business", "unknown"])(
    "skips unsupported %s before token, publication or provider work",
    async (value) => {
      platform = value;
      const result = await runAnalyticsSync({ workspaceId: ws });
      expect(result).toMatchObject({ postsMeasured: 0, postsUnavailable: 0, snapshotsWritten: 0 });
      expect(result.skipped).toMatchObject([{ platform, code: "unsupported" }]);
      expect(mocks.token).not.toHaveBeenCalled();
      expect(mocks.collect).not.toHaveBeenCalled();
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["channels"]);
    },
  );
  it("does not advance the collection timestamp or conceal an unsuccessful write", async () => {
    persistError = true;
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result.snapshotsWritten).toBe(0);
    expect(result.channelsSynced).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(writes.filter((v) => v.table === "channels")).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(privateError.message);
  });
  it("records a collection only through one versioned transactional RPC, never a read/write pair", async () => {
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result.snapshotsWritten).toBe(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "commit_analytics_observation",
      expect.objectContaining({
        _channel_id: channel,
        _expected_version: version,
        _job_id: jobId,
        _external_post_id: "QA_R6_POST_NEVER_SENT",
      }),
    );
    expect(mocks.from.mock.calls.some(([table]) => table === "analytics_snapshots")).toBe(false);
    expect(writes).toEqual([]);
  });
  it("does not mark an unavailable observation as a recent collection", async () => {
    mocks.collect.mockResolvedValue(null);
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result.snapshotsWritten).toBe(0);
    expect(result.postsMeasured).toBe(0);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
  it("reports a per-post collection failure without returning or logging upstream private details", async () => {
    mocks.collect.mockRejectedValue(new Error("QA_UPSTREAM_PRIVATE_BODY"));
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result.errors).toHaveLength(1);
    expect(result.snapshotsWritten).toBe(0);
    expect(writes).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("QA_UPSTREAM_PRIVATE_BODY");
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
      "QA_UPSTREAM_PRIVATE_BODY",
    );
  });
  it("does not reflect database internals when recent publications cannot be read", async () => {
    jobReadError = true;
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result.errors).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(privateError.message);
    expect(mocks.collect).not.toHaveBeenCalled();
  });
  it("refuses a late observation when authorization has changed instead of declaring a write", async () => {
    mocks.rpc.mockResolvedValue({
      data: { accepted: false, reason: "authorization_changed" },
      error: null,
    });
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result.snapshotsWritten).toBe(0);
    expect(result.channelsSynced).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toMatch(/autorização|atualize/i);
    expect(writes).toEqual([]);
  });
  it("does not count a missing persistence receipt as success", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result.snapshotsWritten).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(writes).toEqual([]);
  });
  it("does not count an invalid snapshot receipt as success", async () => {
    mocks.rpc.mockResolvedValue({
      data: { accepted: true, snapshot_id: "not-a-uuid", captured_at: "not-a-date" },
      error: null,
    });
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result.snapshotsWritten).toBe(0);
    expect(result.errors).toHaveLength(1);
  });
  it("reports an unacknowledged commit without leaking details or silently retrying it", async () => {
    mocks.rpc.mockRejectedValue(new Error("QA_PRIVATE_RPC_TRANSPORT"));
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result.snapshotsWritten).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("QA_PRIVATE_RPC_TRANSPORT");
  });
  it.each([-1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, 1.5])(
    "does not persist invalid counter %s",
    async (impressions) => {
      mocks.collect.mockResolvedValue({ metrics: { ...EMPTY_METRICS, impressions } });
      const result = await runAnalyticsSync({ workspaceId: ws });
      expect(result.errors).toHaveLength(1);
      expect(result.snapshotsWritten).toBe(0);
      expect(mocks.rpc).not.toHaveBeenCalled();
      expect(writes).toEqual([]);
    },
  );
});

describe("partial collection accounting and safe continuation", () => {
  it("keeps a successful post visible after another post fails", async () => {
    jobs.push({
      ...jobs[0],
      id: "60000000-0000-4000-8000-000000000007",
      external_post_id: "QA_R6_SECOND_POST",
    });
    mocks.collect.mockRejectedValueOnce(new Error("QA_PRIVATE_POST_ERROR"));
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result).toMatchObject({ postsMeasured: 1, snapshotsWritten: 1, channelsSynced: 1 });
    expect(result.errors).toMatchObject([{ code: "collection_failed", count: 1 }]);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(writes).toEqual([]);
  });
  it("reports missing observations alongside acknowledged posts", async () => {
    jobs.push({
      ...jobs[0],
      id: "60000000-0000-4000-8000-000000000007",
      external_post_id: "QA_R6_SECOND_POST",
    });
    mocks.collect.mockResolvedValueOnce(null);
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result).toMatchObject({ postsMeasured: 1, postsUnavailable: 1, snapshotsWritten: 1 });
    expect(result.skipped).toMatchObject([{ code: "unavailable" }]);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("groups repeated per-post failures without discarding them", async () => {
    jobs.push({ ...jobs[0], external_post_id: "QA_R6_SECOND_POST" });
    mocks.collect.mockRejectedValue(new Error("QA_PRIVATE_BODY"));
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result.errors).toMatchObject([{ code: "collection_failed", count: 2 }]);
    expect(result.snapshotsWritten).toBe(0);
  });
  it("measures distinct real posts even when their content ID is reused", async () => {
    jobs.push({
      ...jobs[0],
      id: "60000000-0000-4000-8000-000000000007",
      external_post_id: "QA_R6_SECOND_POST",
    });
    expect((await runAnalyticsSync({ workspaceId: ws })).snapshotsWritten).toBe(2);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it("does not count the same external post twice through duplicate jobs", async () => {
    jobs.push({ ...jobs[0], id: "60000000-0000-4000-8000-000000000007" });
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result.postsMeasured).toBe(1);
    expect(mocks.collect).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("does not persist or request simulated post IDs", async () => {
    jobs[0].external_post_id = "sim_QA_R6_NOT_REAL";
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result.postsMeasured).toBe(0);
    expect(mocks.collect).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
  it("retains valid read and save counts separately when a commit is unacknowledged", async () => {
    persistError = true;
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result).toMatchObject({ postsMeasured: 1, snapshotsWritten: 0, channelsSynced: 0 });
    expect(result.errors[0].code).toBe("persistence_unconfirmed");
  });
  it("stops the affected channel after an unacknowledged commit without reading remaining posts", async () => {
    jobs.push({ ...jobs[0], external_post_id: "QA_R6_SECOND_POST" });
    mocks.rpc.mockRejectedValue(new Error("QA_PRIVATE_RPC_ERROR"));
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result.snapshotsWritten).toBe(0);
    expect(mocks.collect).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("does not reflect private token-reader errors", async () => {
    mocks.token.mockRejectedValue(new Error("QA_PRIVATE_CREDENTIAL_READER"));
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result.errors).toMatchObject([{ code: "authorization_unavailable" }]);
    expect(JSON.stringify(result)).not.toContain("QA_PRIVATE_CREDENTIAL_READER");
    expect(mocks.collect).not.toHaveBeenCalled();
  });
  it("treats publication changes as a refusal, not a missing row to insert", async () => {
    mocks.rpc.mockResolvedValue({
      data: { accepted: false, reason: "publication_changed" },
      error: null,
    });
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result.errors).toMatchObject([{ code: "publication_changed" }]);
    expect(result.snapshotsWritten).toBe(0);
    expect(writes).toEqual([]);
  });
  it("does not save optional account counters that are invalid", async () => {
    mocks.collect.mockResolvedValue({ metrics: { ...EMPTY_METRICS }, accountFollowers: -1 });
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result.errors).toMatchObject([{ code: "invalid_metrics" }]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("saves actual zero followers, strips metadata and reports an explicit optional-read warning", async () => {
    mocks.collect.mockResolvedValue({
      metrics: { ...EMPTY_METRICS, followers: 50, access_token: "QA_PRIVATE_NOT_A_METRIC" },
      accountFollowers: 0,
      warnings: ["additional_metrics_unavailable"],
    });
    const result = await runAnalyticsSync({ workspaceId: ws });
    expect(result.snapshotsWritten).toBe(1);
    expect(result.errors).toMatchObject([{ code: "additional_metrics_unavailable" }]);
    expect(mocks.rpc.mock.calls[0][1]._metrics.followers).toBe(0);
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain("QA_PRIVATE_NOT_A_METRIC");
  });
  it.each([0, -1, 1.5, Infinity, 181])(
    "refuses invalid lookback %s before any database/provider call",
    async (lookbackDays) => {
      await expect(runAnalyticsSync({ workspaceId: ws, lookbackDays })).rejects.toThrow(
        "inválidos",
      );
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.collect).not.toHaveBeenCalled();
    },
  );
});
