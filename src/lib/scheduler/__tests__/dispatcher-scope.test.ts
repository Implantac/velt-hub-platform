import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  publish: vi.fn(),
  getFreshToken: vi.fn(),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: state.rpc, from: state.from },
}));
vi.mock("@/lib/oauth/refresh.server", () => ({ getFreshToken: state.getFreshToken }));
vi.mock("../publishers.server", async (original) => ({
  ...(await original<typeof import("../publishers.server")>()),
  publishToPlatform: state.publish,
}));
vi.mock("../reconciliation.server", () => ({
  runPublicationReconciliation: vi.fn(async () => ({ checked: 0, confirmed: 0 })),
}));
import { runSchedulerCycle, runSchedulerTick } from "../dispatcher.server";
import { PublisherError } from "../publishers.server";
import type { PublishInput } from "../contracts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const channelId = "22222222-2222-4222-8222-222222222222";
const foreignWorkspace = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const job = {
  id: "33333333-3333-4333-8333-333333333333",
  workspace_id: workspaceId,
  content_id: "44444444-4444-4444-8444-444444444444",
  channel_id: channelId,
  delivery_token: "55555555-5555-4555-8555-555555555555",
  status: "processing",
  attempts: 1,
  max_attempts: 3,
  reconcile_state: "none",
  delivery_started_at: null,
  provider_reference: null,
  provider_reference_kind: null,
  provider_platform: null,
  provider_target: null,
  external_post_id: null,
};
const postId = "12345_987654321";
let rows: Record<string, unknown>, claimed: (typeof job)[], settled: Record<string, unknown>;
let completionError: string | null,
  failureError: string | null,
  failureOverride: unknown,
  completionOverride: unknown;
let completionNull: boolean;
const calls = (name: string) => state.rpc.mock.calls.filter(([rpc]) => rpc === name);

beforeEach(() => {
  vi.clearAllMocks();
  claimed = [{ ...job }];
  settled = { ...job };
  completionError = null;
  failureError = null;
  failureOverride = undefined;
  completionOverride = undefined;
  completionNull = false;
  rows = {
    channels: {
      id: channelId,
      workspace_id: workspaceId,
      platform: "facebook",
      status: "connected",
      external_id: "12345",
      metadata: {},
    },
    content: {
      id: job.content_id,
      workspace_id: workspaceId,
      title: "Synthetic fenced dispatch contract",
      body: "Body",
      type: "post",
      media: [],
      metadata: {},
    },
  };
  state.from.mockImplementation((table: string) => {
    const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.single.mockImplementation(async () => ({ data: rows[table], error: null }));
    return query;
  });
  state.getFreshToken.mockResolvedValue({
    accessToken: "token-test-only",
    refreshToken: null,
    expiresAt: null,
    scope: null,
    tokenType: "Bearer",
  });
  state.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "claim_publication_jobs") return { data: claimed, error: null };
    if (name === "begin_publication_delivery") {
      if (settled.id !== args._job_id)
        settled = { ...claimed.find((row) => row.id === args._job_id)! };
      settled = {
        ...settled,
        id: args._job_id,
        delivery_started_at: "2026-11-12T12:00:00Z",
        provider_platform: args._platform,
        provider_target: args._target,
        reconcile_state: "pending",
      };
      return { data: { ...settled }, error: null };
    }
    if (name === "checkpoint_publication_delivery") {
      settled = {
        ...settled,
        provider_reference: args._reference,
        provider_reference_kind: args._kind,
      };
      return { data: { ...settled }, error: null };
    }
    if (name === "complete_publication_delivery") {
      if (completionError) return { data: null, error: { message: completionError } };
      if (completionNull) return { data: null, error: null };
      settled = {
        ...settled,
        status: "succeeded",
        reconcile_state: "confirmed",
        external_post_id: args._external_post_id,
      };
      return {
        data: completionOverride === undefined ? { ...settled } : completionOverride,
        error: null,
      };
    }
    if (name === "fail_publication_delivery") {
      if (failureError) return { data: null, error: { message: failureError } };
      if (failureOverride !== undefined) return { data: failureOverride, error: null };
      const started = !!settled.delivery_started_at;
      settled = {
        ...settled,
        status: started ? "dead_letter" : "pending",
        reconcile_state: started ? (args._reference ? "pending" : "review") : "none",
      };
      return { data: { ...settled }, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  state.publish.mockImplementation(async (input: PublishInput) => {
    await input.beforeWrite?.();
    await input.checkpoint?.({ kind: "facebook_post", id: postId });
    return { externalPostId: postId };
  });
});

describe("workspace-scoped fenced publication dispatch", () => {
  it("passes workspace to service claim and caps a batch at three", async () => {
    const result = await runSchedulerTick({ workspaceId, limit: 25, lockSeconds: 300 });
    expect(state.rpc).toHaveBeenCalledWith("claim_publication_jobs", {
      _limit: 3,
      _lock_seconds: 300,
      _workspace_id: workspaceId,
    });
    expect(result).toMatchObject({
      claimed: 1,
      succeeded: 1,
      awaitingConfirmation: 0,
      needsReview: 0,
    });
    expect(state.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        channelId,
        payload: expect.objectContaining({ body: "Body" }),
        beforeWrite: expect.any(Function),
        checkpoint: expect.any(Function),
      }),
    );
  });
  it("rejects a cross-workspace claim before querying or sending", async () => {
    claimed = [{ ...job, workspace_id: foreignWorkspace }];
    await expect(runSchedulerTick({ workspaceId })).rejects.toThrow("different workspace");
    expect(state.from).not.toHaveBeenCalled();
    expect(state.publish).not.toHaveBeenCalled();
  });
  it("checks the channel workspace independently", async () => {
    rows.channels = { ...(rows.channels as object), workspace_id: foreignWorkspace };
    expect(await runSchedulerTick({ workspaceId })).toMatchObject({ failed: 1, succeeded: 0 });
    expect(state.publish).not.toHaveBeenCalled();
    expect(calls("begin_publication_delivery")).toHaveLength(0);
  });
  it("checks the content workspace independently", async () => {
    rows.content = { ...(rows.content as object), workspace_id: foreignWorkspace };
    expect(await runSchedulerTick({ workspaceId })).toMatchObject({ failed: 1 });
    expect(state.publish).not.toHaveBeenCalled();
  });
  it("scopes channel and content queries by both ID and workspace", async () => {
    await runSchedulerTick({ workspaceId });
    for (const result of state.from.mock.results)
      expect(result.value.eq).toHaveBeenCalledWith("workspace_id", workspaceId);
  });
  it("returns an honest empty queue", async () => {
    claimed = [];
    await expect(runSchedulerTick({ workspaceId })).resolves.toEqual({
      claimed: 0,
      succeeded: 0,
      failed: 0,
      awaitingConfirmation: 0,
      needsReview: 0,
      jobs: [],
    });
    expect(state.publish).not.toHaveBeenCalled();
  });
  it("never dispatches without OAuth credentials", async () => {
    state.getFreshToken.mockRejectedValue(new Error("Missing OAuth token"));
    expect(await runSchedulerTick({ workspaceId })).toMatchObject({ failed: 1 });
    expect(state.publish).not.toHaveBeenCalled();
    expect(calls("begin_publication_delivery")).toHaveLength(0);
  });
  it("stops the write when begin is not durably acknowledged", async () => {
    const implementation = state.rpc.getMockImplementation()!;
    state.rpc.mockImplementation((name, args) =>
      name === "begin_publication_delivery"
        ? Promise.resolve({ data: null, error: { message: "lost boundary acknowledgement" } })
        : implementation(name, args),
    );
    let sent = false;
    state.publish.mockImplementation(async (input: PublishInput) => {
      await input.beforeWrite?.();
      sent = true;
      return { externalPostId: postId };
    });
    expect(await runSchedulerTick({ workspaceId })).toMatchObject({ succeeded: 0, failed: 1 });
    expect(sent).toBe(false);
  });
  it("preserves a locally received reference even if its checkpoint RPC fails", async () => {
    const implementation = state.rpc.getMockImplementation()!;
    state.rpc.mockImplementation((name, args) =>
      name === "checkpoint_publication_delivery"
        ? Promise.resolve({ data: null, error: { message: "checkpoint response lost" } })
        : implementation(name, args),
    );
    expect(await runSchedulerTick({ workspaceId })).toMatchObject({
      succeeded: 0,
      awaitingConfirmation: 1,
    });
    expect(calls("complete_publication_delivery")).toHaveLength(0);
    expect(calls("fail_publication_delivery")[0][1]).toMatchObject({
      _reference: postId,
      _reference_kind: "facebook_post",
    });
  });
  it.each(["error", "zero rows"])(
    "does not report completion with an unconfirmed %s acknowledgement",
    async (mode) => {
      completionError = mode === "error" ? "ack lost" : null;
      completionNull = mode !== "error";
      expect(await runSchedulerTick({ workspaceId })).toMatchObject({
        succeeded: 0,
        awaitingConfirmation: 1,
      });
      expect(calls("fail_publication_delivery")[0][1]).toMatchObject({
        _delivery_token: job.delivery_token,
        _reference: postId,
      });
    },
  );
  it("recovers a lost completion response only from matching committed success", async () => {
    completionError = "response lost after commit";
    failureOverride = {
      ...job,
      status: "succeeded",
      reconcile_state: "confirmed",
      external_post_id: postId,
    };
    expect(await runSchedulerTick({ workspaceId })).toMatchObject({ succeeded: 1 });
  });
  it.each([
    null,
    { ...job, status: "processing" },
    { ...job, status: "succeeded", external_post_id: "12345_other", reconcile_state: "confirmed" },
    { ...job, workspace_id: foreignWorkspace, status: "dead_letter", reconcile_state: "pending" },
  ])("fails closed for a missing or conflicting settlement: %j", async (row) => {
    completionError = "ack lost";
    failureOverride = row;
    await expect(runSchedulerTick({ workspaceId })).rejects.toThrow("estado confirmado");
  });
  it("does not swallow failure persistence errors", async () => {
    completionError = "ack lost";
    failureError = "database down";
    await expect(runSchedulerTick({ workspaceId })).rejects.toThrow("estado confirmado");
  });
  it.each([null, [{ ...job, delivery_token: null }]])(
    "rejects an unfenced claim instead of using legacy completion",
    async (data) => {
      state.rpc.mockResolvedValue({ data, error: null });
      await expect(runSchedulerTick({ workspaceId })).rejects.toThrow("confirmed fenced job set");
      expect(state.publish).not.toHaveBeenCalled();
    },
  );
  it("records an accepted reference without treating processing as public", async () => {
    state.publish.mockImplementation(async (input: PublishInput) => {
      await input.beforeWrite?.();
      await input.checkpoint?.({ kind: "facebook_post", id: postId });
      throw new PublisherError("Awaiting public confirmation", {
        reference: { kind: "facebook_post", id: postId },
      });
    });
    expect(await runSchedulerTick({ workspaceId })).toMatchObject({
      succeeded: 0,
      awaitingConfirmation: 1,
      failed: 0,
    });
    expect(calls("complete_publication_delivery")).toHaveLength(0);
  });
  it("separates an uncertain write without any reference from a safe pre-write failure", async () => {
    state.publish.mockImplementation(async (input: PublishInput) => {
      await input.beforeWrite?.();
      throw new PublisherError("Connection reset during POST", { retryable: true });
    });
    expect(await runSchedulerTick({ workspaceId })).toMatchObject({
      succeeded: 0,
      failed: 0,
      needsReview: 1,
    });
  });
  it("serializes multiple jobs for one account within the bounded batch", async () => {
    claimed = [{ ...job }, { ...job, id: "66666666-6666-4666-8666-666666666666" }];
    let active = 0;
    let maximum = 0;
    state.publish.mockImplementation(async (input: PublishInput) => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      await input.beforeWrite?.();
      await input.checkpoint?.({ kind: "facebook_post", id: postId });
      active--;
      return { externalPostId: postId };
    });
    expect(await runSchedulerTick({ workspaceId })).toMatchObject({ claimed: 2, succeeded: 2 });
    expect(maximum).toBe(1);
  });
  it("runs read-only recovery/checks before new publication claims", async () => {
    const { runPublicationReconciliation } = await import("../reconciliation.server");
    await runSchedulerCycle({ workspaceId });
    expect(runPublicationReconciliation).toHaveBeenCalledWith({ workspaceId, limit: 5 });
    expect(vi.mocked(runPublicationReconciliation).mock.invocationCallOrder.at(-1)!).toBeLessThan(
      state.rpc.mock.invocationCallOrder[0],
    );
  });
  it.each([0, -1, 51, 1.5])("rejects invalid batch size %s without a claim", async (limit) => {
    await expect(runSchedulerTick({ workspaceId, limit })).rejects.toThrow("batch limit");
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
