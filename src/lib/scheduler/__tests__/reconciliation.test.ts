import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), token: vi.fn(), observe: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: mocks.rpc, from: mocks.from },
}));
vi.mock("@/lib/oauth/refresh.server", () => ({ getFreshToken: mocks.token }));
vi.mock("../observe.server", () => ({ observePublication: mocks.observe }));
// A reconciliation import must never acquire a write dependency.
vi.mock("../publishers.server", () => {
  throw new Error("Read-only reconciliation must not import a publisher");
});
import { OAuthCredentialError } from "@/lib/oauth/errors.server";
import { runPublicationReconciliation } from "../reconciliation.server";

const ws = "11111111-1111-4111-8111-111111111111",
  other = "99999999-9999-4999-8999-999999999999";
const base = {
  id: "22222222-2222-4222-8222-222222222222",
  workspace_id: ws,
  channel_id: "33333333-3333-4333-8333-333333333333",
  status: "dead_letter",
  reconcile_state: "pending",
  reconcile_token: "44444444-4444-4444-8444-444444444444",
  provider_platform: "facebook",
  provider_target: "111",
  provider_reference: "111_222",
  provider_reference_kind: "facebook_post",
};
const channelBase = {
  id: base.channel_id,
  workspace_id: ws,
  status: "connected",
  platform: "facebook",
  external_id: "111",
  metadata: {},
};
let recovered: unknown,
  queue: unknown[],
  channel: unknown,
  channelError: { message: string } | null,
  recordedOverride: unknown;
const opts = { workspaceId: ws, jobId: base.id };
beforeEach(() => {
  vi.clearAllMocks();
  recovered = [];
  queue = [{ ...base }];
  channel = { ...channelBase };
  channelError = null;
  recordedOverride = undefined;
  mocks.token.mockResolvedValue({ accessToken: "QA_TOKEN_NOT_SENT", refreshed: false });
  mocks.observe.mockResolvedValue({
    state: "confirmed",
    externalPostId: base.provider_reference,
    note: "Synthetic HTTP evidence; no provider contacted",
  });
  mocks.from.mockImplementation(() => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.maybeSingle.mockImplementation(async () => ({ data: channel, error: channelError }));
    return query;
  });
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "recover_publication_deliveries") return { data: recovered, error: null };
    if (name === "claim_publication_reconciliations") {
      const next = queue.shift();
      return { data: next === undefined ? [] : [next], error: null };
    }
    if (name === "settle_publication_reconciliation")
      return {
        data:
          recordedOverride === undefined
            ? {
                ...base,
                id: args._job_id,
                status: args._state === "confirmed" ? "succeeded" : "dead_letter",
                reconcile_state: args._state,
                external_post_id: args._external_post_id,
              }
            : recordedOverride,
        error: null,
      };
    throw new Error(`Unexpected reconciliation RPC: ${name}`);
  });
});
afterEach(() => {
  vi.useRealTimers();
});
const settlements = () =>
  mocks.rpc.mock.calls.filter(([name]) => name === "settle_publication_reconciliation");

describe("read-only durable reconciliation service", () => {
  it("recovers and checks only the requested workspace and job", async () => {
    const r = await runPublicationReconciliation(opts);
    expect(r).toMatchObject({
      recovered: 0,
      checked: 1,
      providerQueries: 1,
      confirmed: 1,
      pending: 0,
      review: 0,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "recover_publication_deliveries", {
      _workspace_id: ws,
      _job_id: base.id,
      _limit: 50,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "claim_publication_reconciliations", {
      _workspace_id: ws,
      _job_id: base.id,
      _limit: 1,
      _lock_seconds: 60,
    });
    expect(mocks.observe).toHaveBeenCalledExactlyOnceWith({
      platform: "facebook",
      target: "111",
      reference: { kind: "facebook_post", id: "111_222" },
      accessToken: "QA_TOKEN_NOT_SENT",
    });
    expect(mocks.from.mock.results[0].value.eq).toHaveBeenCalledWith("workspace_id", ws);
  });
  it("does not treat an empty result as a provider query or publication", async () => {
    queue = [];
    expect(await runPublicationReconciliation(opts)).toMatchObject({
      checked: 0,
      confirmed: 0,
      providerQueries: 0,
    });
    expect(mocks.observe).not.toHaveBeenCalled();
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it("returns safely requeued attempts separately from manual review", async () => {
    queue = [];
    recovered = [{ ...base, status: "pending", reconcile_state: "none" }];
    expect(await runPublicationReconciliation(opts)).toMatchObject({
      recovered: 1,
      safelyRequeued: 1,
      confirmed: 0,
      checked: 0,
    });
  });
  it.each(["pending", "review"])(
    "reports recovered %s even when no provider check is due",
    async (state) => {
      queue = [];
      recovered = [{ ...base, reconcile_state: state }];
      const result = await runPublicationReconciliation(opts);
      expect(result).toMatchObject({ recovered: 1, [state]: 1, providerQueries: 0 });
    },
  );
  it("does not double count a recovered review that was checked in the same call", async () => {
    recovered = [{ ...base, reconcile_state: "review" }];
    mocks.observe.mockResolvedValue({ state: "review", note: "No read permission" });
    expect(await runPublicationReconciliation(opts)).toMatchObject({
      review: 1,
      checked: 1,
      providerQueries: 1,
    });
  });
  it.each([
    { ...base, workspace_id: other },
    { ...base, id: other },
  ])("stops on a foreign recovery response %j", async (row) => {
    recovered = [row];
    await expect(runPublicationReconciliation(opts)).rejects.toThrow("fora do workspace");
    expect(mocks.observe).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...base, workspace_id: other },
    { ...base, id: other },
    { ...base, reconcile_token: null },
    { ...base, status: "processing" },
    { ...base, reconcile_state: "closed" },
  ])("refuses an invalid/fenced claim %j before reading", async (row) => {
    queue = [row];
    await expect(runPublicationReconciliation(opts)).rejects.toThrow();
    expect(mocks.observe).not.toHaveBeenCalled();
  });
  it.each([
    "recover_publication_deliveries",
    "claim_publication_reconciliations",
    "settle_publication_reconciliation",
  ])("does not swallow a persistence failure in %s", async (fn) => {
    const original = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name, args) =>
      name === fn
        ? Promise.resolve({ data: null, error: { message: "database unavailable" } })
        : original(name, args),
    );
    await expect(runPublicationReconciliation(opts)).rejects.toThrow();
  });
  it.each([null, [{ ...base }]])(
    "does not report success without a confirmed compound row %j",
    async (row) => {
      recordedOverride = row;
      await expect(runPublicationReconciliation(opts)).rejects.toThrow(
        "não teve o resultado confirmado",
      );
    },
  );
  it.each([
    { ...base, status: "succeeded", reconcile_state: "pending", external_post_id: "111_222" },
    {
      ...base,
      workspace_id: other,
      status: "succeeded",
      reconcile_state: "confirmed",
      external_post_id: "111_222",
    },
    { ...base, status: "succeeded", reconcile_state: "confirmed", external_post_id: "111_999" },
  ])("requires the exact confirmed result %j", async (row) => {
    recordedOverride = row;
    await expect(runPublicationReconciliation(opts)).rejects.toThrow(
      "não teve o resultado confirmado",
    );
  });
  it.each([
    ["pending", "pending"],
    ["review", "review"],
    ["rejected", "rejected"],
  ])("persists %s as %s without an external post ID", async (state, key) => {
    mocks.observe.mockResolvedValue({ state, note: "Synthetic result, no new send" });
    expect(await runPublicationReconciliation(opts)).toMatchObject({
      confirmed: 0,
      providerQueries: 1,
      [key]: 1,
    });
    expect(settlements()[0][1]).toMatchObject({
      _state: state,
      _external_post_id: null,
      _reconcile_token: base.reconcile_token,
    });
  });
  it("accepts the SQL-enforced transition from pending to review at automatic limits", async () => {
    mocks.observe.mockResolvedValue({ state: "pending", note: "Still processing" });
    recordedOverride = { ...base, reconcile_state: "review" };
    expect(await runPublicationReconciliation(opts)).toMatchObject({ review: 1, pending: 0 });
  });
  it("does not accept a contradictory rejected-to-pending settlement", async () => {
    mocks.observe.mockResolvedValue({ state: "rejected", note: "Explicit failure" });
    recordedOverride = { ...base };
    await expect(runPublicationReconciliation(opts)).rejects.toThrow(
      "não teve o resultado confirmado",
    );
  });
  it.each([
    null,
    { ...channelBase, workspace_id: other },
    { ...channelBase, platform: "instagram" },
    { ...channelBase, external_id: "999" },
    { ...channelBase, status: "disconnected" },
    { ...channelBase, metadata: { page_id: "999" } },
  ])("requires the same connected account before obtaining tokens %j", async (value) => {
    channel = value;
    expect(await runPublicationReconciliation(opts)).toMatchObject({
      review: 1,
      confirmed: 0,
      providerQueries: 0,
    });
    expect(mocks.observe).not.toHaveBeenCalled();
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it.each([
    { provider_reference: null },
    { provider_reference_kind: null },
    { provider_platform: null },
    { provider_target: null },
    { provider_reference: "999_222" },
    { provider_reference_kind: "facebook_photo", provider_reference: "222" },
  ])("requires a safe exact reference %j", async (patch) => {
    queue = [{ ...base, ...patch }];
    expect(await runPublicationReconciliation(opts)).toMatchObject({
      review: 1,
      providerQueries: 0,
    });
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.observe).not.toHaveBeenCalled();
  });
  it("does not turn a database read failure into a false permission review", async () => {
    channelError = { message: "read unavailable" };
    await expect(runPublicationReconciliation(opts)).rejects.toThrow("ler o canal");
    expect(settlements()).toHaveLength(0);
  });
  it("keeps missing OAuth authorization separate from actual provider reads", async () => {
    mocks.token.mockRejectedValue(new Error("No OAuth grant"));
    expect(await runPublicationReconciliation(opts)).toMatchObject({
      review: 1,
      providerQueries: 0,
    });
    expect(mocks.observe).not.toHaveBeenCalled();
  });
  it("claims one lease just in time and reads sequentially", async () => {
    queue = [{ ...base }, { ...base, id: other }];
    const order: string[] = [];
    const original = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name, args) => {
      order.push(name);
      return original(name, args);
    });
    mocks.observe.mockImplementation(async () => {
      order.push("read");
      return { state: "pending", note: "Still processing" };
    });
    expect(await runPublicationReconciliation({ workspaceId: ws, limit: 2 })).toMatchObject({
      checked: 2,
      providerQueries: 2,
    });
    expect(order).toEqual([
      "recover_publication_deliveries",
      "claim_publication_reconciliations",
      "read",
      "settle_publication_reconciliation",
      "claim_publication_reconciliations",
      "read",
      "settle_publication_reconciliation",
    ]);
    for (const [, args] of mocks.rpc.mock.calls.filter(
      ([name]) => name === "claim_publication_reconciliations",
    ))
      expect(args).toMatchObject({ _limit: 1 });
  });
  it("leaves unclaimed work for the next cron when the read budget is exhausted", async () => {
    vi.useFakeTimers();
    queue = [{ ...base }, { ...base, id: other }];
    mocks.observe.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 46_000);
      return { state: "pending", note: "Still processing" };
    });
    expect(await runPublicationReconciliation({ workspaceId: ws, limit: 5 })).toMatchObject({
      checked: 1,
    });
    expect(queue).toHaveLength(1);
  });
  it("requires an explicit workspace for an individual check", async () => {
    await expect(runPublicationReconciliation({ jobId: base.id })).rejects.toThrow(
      "workspace explícito",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([0, -1, 51, 1.5])("refuses invalid limit %s before any recovery", async (limit) => {
    await expect(runPublicationReconciliation({ workspaceId: ws, limit })).rejects.toThrow(
      "Limite inválido",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["refresh_busy", "refresh_cooldown", "credential_changed", "store_unavailable"] as const)(
    "keeps transient OAuth %s pending without a provider read or manual-review downgrade",
    async (code) => {
      mocks.token.mockRejectedValue(new OAuthCredentialError(code, true));
      expect(await runPublicationReconciliation(opts)).toMatchObject({
        pending: 1,
        providerQueries: 0,
        review: 0,
      });
      expect(mocks.observe).not.toHaveBeenCalled();
      expect(settlements()[0][1]._state).toBe("pending");
    },
  );
  it("requires explicit review for an uncertain rotating grant, without contacting the provider", async () => {
    mocks.token.mockRejectedValue(new OAuthCredentialError("refresh_uncertain", false));
    expect(await runPublicationReconciliation(opts)).toMatchObject({
      review: 1,
      providerQueries: 0,
    });
    expect(mocks.observe).not.toHaveBeenCalled();
  });
});
