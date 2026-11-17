import { describe, expect, it, vi } from "vitest";
import { timingRecommendationSchema, type TimingRecommendation } from "@/lib/growth/timing";

type Result = { data: unknown; error: { message: string } | null };
type Call = { table: string; action: string; args: unknown[] };
type Handler = (args: {
  data: unknown;
  context: { userId: string; supabase: unknown };
}) => Promise<TimingRecommendation>;
// Pre-authenticated unit contexts, not real Auth/RLS/provider observations.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (v: unknown) => v;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof parse) => {
        parse = fn;
        return builder;
      },
      handler: (fn: Handler) => async (args: Parameters<Handler>[0]) =>
        fn({ ...args, data: parse(args.data) }),
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { getBestTimeToPost } from "../growth.functions";
const handler = getBestTimeToPost as unknown as Handler;
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const workspaceId = uuid(1),
  userId = uuid(2),
  channelId = uuid(3),
  contentId = uuid(4);
const from = "2026-11-12T12:00:00.000Z";
const job = {
  id: uuid(5),
  channel_id: channelId,
  content_id: contentId,
  status: "succeeded",
  external_post_id: "external-publication-a",
  delivery_started_at: "2026-11-02T15:00:00Z",
};
const snap = {
  id: uuid(6),
  channel_id: channelId,
  content_id: contentId,
  captured_at: "2026-11-03T15:00:00Z",
  metrics: {
    source: "sync",
    job_id: job.id,
    post_id: job.external_post_id,
    engagement: 15,
    impressions: 100,
  },
};
const ok = (data: unknown): Result => ({ data, error: null });
function fixture(overrides: Record<string, Result | Result[]> = {}) {
  const results: Record<string, Result | Result[]> = {
    workspace_members: ok({ role: "owner" }),
    channels: ok({
      id: channelId,
      platform: "youtube",
      handle: "unit-only",
      status: "disconnected",
    }),
    scheduler_jobs: ok([job]),
    analytics_snapshots: ok([snap]),
    user_profile_digital: ok(null),
    ...overrides,
  };
  const calls: Call[] = [];
  const result = (table: string) => {
    const r = results[table];
    return Array.isArray(r) ? r.shift()! : r;
  };
  return {
    calls,
    context: {
      userId,
      supabase: {
        from: (table: string) => {
          calls.push({ table, action: "from", args: [] });
          const q: Record<string, unknown> = {};
          for (const action of [
            "select",
            "eq",
            "in",
            "not",
            "gte",
            "lte",
            "order",
            "limit",
            "range",
          ])
            q[action] = (...args: unknown[]) => {
              calls.push({ table, action, args });
              return q;
            };
          q.maybeSingle = async () => result(table);
          q.then = (resolve: (r: Result) => void) => resolve(result(table));
          return q;
        },
      },
    },
  };
}
const input = { workspaceId, platform: "youtube", channelId, timeZone: "America/Sao_Paulo", from };
const run = (f: ReturnType<typeof fixture>, patch: Record<string, unknown> = {}) =>
  handler({ data: { ...input, ...patch }, context: f.context });

describe("contextual timing read handler", () => {
  it.each(["owner", "admin", "editor", "viewer"])(
    "allows authorized %s reads without writes or providers",
    async (role) => {
      const f = fixture({ workspace_members: ok({ role }) });
      const data = await run(f);
      expect(data.workspaceId).toBe(workspaceId);
      expect(data.channel?.id).toBe(channelId);
      expect(data.usedFallback).toBe(true); // One observation is not six.
      expect(data.observationsCount).toBe(1);
      expect(timingRecommendationSchema.safeParse(data).success).toBe(true);
      expect(f.calls.every((c) => !["insert", "update", "delete", "rpc"].includes(c.action))).toBe(
        true,
      );
    },
  );
  it("rejects a nonmember before reading history or profile", async () => {
    const f = fixture({ workspace_members: ok(null) });
    await expect(run(f)).rejects.toThrow("forbidden");
    expect(f.calls.filter((c) => c.action === "from").map((c) => c.table)).toEqual([
      "workspace_members",
    ]);
  });
  it.each([
    "workspace_members",
    "channels",
    "scheduler_jobs",
    "analytics_snapshots",
    "user_profile_digital",
  ])("does not turn a %s read failure into a generic successful suggestion", async (table) => {
    const f = fixture({ [table]: { data: null, error: { message: "read unavailable" } } });
    await expect(run(f)).rejects.toThrow("read unavailable");
  });
  it("gives the same missing-context failure for absent and wrong-platform channels", async () => {
    for (const channel of [
      null,
      { id: channelId, platform: "instagram", handle: "other", status: "connected" },
    ]) {
      const f = fixture({ channels: ok(channel) });
      await expect(run(f)).rejects.toThrow("Canal não encontrado neste workspace e plataforma.");
      expect(f.calls.some((c) => c.table === "scheduler_jobs")).toBe(false);
    }
  });
  it("reads only the selected workspace/channel and recorded send interval", async () => {
    const f = fixture();
    await run(f);
    for (const table of ["channels", "scheduler_jobs", "analytics_snapshots"])
      expect(f.calls).toContainEqual({ table, action: "eq", args: ["workspace_id", workspaceId] });
    for (const table of ["scheduler_jobs", "analytics_snapshots"])
      expect(f.calls).toContainEqual({ table, action: "eq", args: ["channel_id", channelId] });
    expect(f.calls).toContainEqual({ table: "channels", action: "eq", args: ["id", channelId] });
    expect(f.calls).toContainEqual({
      table: "scheduler_jobs",
      action: "eq",
      args: ["status", "succeeded"],
    });
    expect(f.calls).toContainEqual({
      table: "scheduler_jobs",
      action: "not",
      args: ["external_post_id", "like", "sim\\_%"],
    });
    expect(f.calls).toContainEqual({
      table: "scheduler_jobs",
      action: "lte",
      args: ["delivery_started_at", from],
    });
    expect(f.calls).toContainEqual({ table: "scheduler_jobs", action: "limit", args: [300] });
    expect(
      f.calls.some((c) => c.action === "select" && String(c.args[0]).includes("scheduled_at")),
    ).toBe(false);
    expect(f.calls).toContainEqual({
      table: "user_profile_digital",
      action: "eq",
      args: ["user_id", userId],
    });
  });
  it("never reads account history for a generic platform reference", async () => {
    const f = fixture();
    const data = await run(f, { channelId: undefined });
    expect(data.channel).toBeNull();
    expect(data.observationsCount).toBe(0);
    expect(data.usedFallback).toBe(true);
    expect(f.calls.filter((c) => c.action === "from").map((c) => c.table)).toEqual([
      "workspace_members",
      "user_profile_digital",
    ]);
  });
  it("requires a platform instead of assuming Instagram", async () => {
    const f = fixture();
    await expect(run(f, { platform: undefined })).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });
  it.each([
    { timeZone: "Not/A_Zone" },
    { timeZone: "+05:30" },
    { timeZone: "-03:00" },
    { channelId: "not-a-uuid" },
    { platform: "unknown" },
    { from: "not-an-instant" },
  ])("validates context before any read: %o", async (patch) => {
    const f = fixture();
    await expect(run(f, patch)).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });
  it("computes the selected local reference window with a non-hour UTC offset", async () => {
    const f = fixture();
    const data = await run(f, {
      channelId: undefined,
      platform: "instagram",
      timeZone: "Asia/Kolkata",
      from: "2026-11-02T02:00:00Z",
    });
    expect(data.best.at).toBe("2026-11-02T05:30:00.000Z");
    expect(data.topSlots[0].hour).toBe(11);
    expect(data.timeZone).toBe("Asia/Kolkata");
  });
  it("does not equate partial attributed history with sufficient personalized evidence", async () => {
    const f = fixture();
    const data = await run(f);
    expect(data.observationsCount).toBe(1);
    expect(data.best.confidence).toBe("baseline");
    expect(data.best.samples).toBe(0);
  });
  it("uses six distinct, attributed measured sends without including server-language prose", async () => {
    const jobs = Array.from({ length: 6 }, (_, i) => ({
      ...job,
      id: uuid(20 + i),
      external_post_id: `external-${i}`,
      delivery_started_at: new Date(Date.UTC(2026, 8, 7 + i * 7, 15)).toISOString(),
    }));
    const snapshots = jobs.map((j, i) => ({
      ...snap,
      id: uuid(40 + i),
      captured_at: new Date(Date.parse(j.delivery_started_at) + 86400000).toISOString(),
      metrics: {
        source: "sync",
        post_id: j.external_post_id,
        job_id: j.id,
        engagement: 10 + i,
        impressions: 100,
      },
    }));
    const f = fixture({ scheduler_jobs: ok(jobs), analytics_snapshots: ok(snapshots) });
    const data = await run(f);
    expect(data.usedFallback).toBe(false);
    expect(data.observationsCount).toBe(6);
    expect(data.best.samples).toBe(6);
    expect(data.best.confidence).toBe("observed");
    expect(data.basis).toBe("engagement_rate");
    expect(JSON.stringify(data)).not.toMatch(/"(?:rationale|reason)":|Janela|Média/);
  });
  it("paginates snapshots and counts a publication only once", async () => {
    const firstPage = Array.from({ length: 500 }, (_, i) => ({
      ...snap,
      id: `snapshot-${String(i).padStart(4, "0")}`,
    }));
    const f = fixture({ analytics_snapshots: [ok(firstPage), ok([{ ...snap, id: "last-page" }])] });
    const data = await run(f);
    expect(f.calls).toContainEqual({
      table: "analytics_snapshots",
      action: "range",
      args: [0, 499],
    });
    expect(f.calls).toContainEqual({
      table: "analytics_snapshots",
      action: "range",
      args: [500, 999],
    });
    expect(data.observationsCount).toBe(1);
  });
  it.each(["scheduler_jobs", "analytics_snapshots"])(
    "does not call an unreturned %s result an empty history",
    async (table) => {
      const f = fixture({ [table]: ok(null) });
      await expect(run(f)).rejects.toThrow();
    },
  );
});
