import { describe, expect, it, vi } from "vitest";

type QueryResult = { data?: unknown; count?: number | null; error: { message: string } | null };
type Query = { table: string; actions: Array<{ name: string; args: unknown[] }> };
type Handler = ((args: {
  data: unknown;
  context: { supabase: unknown; userId: string };
}) => Promise<unknown>) & { method: string };
const generators = vi.hoisted(() => ({
  buildSnapshot: vi.fn(() => {
    throw new Error("A dashboard read must not generate a snapshot");
  }),
}));
// Preauthenticated, synthetic query transport only. These tests do not attest Auth/RLS/Postgres.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: ({ method }: { method: string }) => {
    let parse = (value: unknown) => value;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof parse) => {
        parse = fn;
        return builder;
      },
      handler: (fn: Handler) =>
        Object.assign(
          async (args: Parameters<Handler>[0]) => fn({ ...args, data: parse(args.data) }),
          { method },
        ),
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/brain/brain", () => generators);

import { getDashboard } from "../dashboard.functions";
import { getLatestHealth } from "../health.functions";
import {
  getDashboardAnalysis,
  getDashboardRecommendations,
  getDashboardOpportunities,
  getDashboardBlueprint,
  getDashboardCompetitors,
  getDashboardSkills,
  getDashboardJourney,
} from "../dashboard-panels.functions";
import { DASHBOARD_CONTENT_STATUSES } from "@/lib/dashboard/overview";
import { DASHBOARD_QUESTIONS } from "@/lib/dashboard/saved-analysis";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const at = "2026-11-12T15:00:00Z";
const allHandlers = [
  ["overview", getDashboard],
  ["analysis", getDashboardAnalysis],
  ["recommendations", getDashboardRecommendations],
  ["opportunities", getDashboardOpportunities],
  ["blueprint", getDashboardBlueprint],
  ["competitors", getDashboardCompetitors],
  ["skills", getDashboardSkills],
  ["journey", getDashboardJourney],
  ["health", getLatestHealth],
] as const;
const action = (query: Query, name: string, column?: string) =>
  query.actions.find(
    (entry) => entry.name === name && (column === undefined || entry.args[0] === column),
  );
const eq = (query: Query, column: string) => action(query, "eq", column)?.args[1];
const counts = {
  draft: 1_201,
  scheduled: 12,
  publishing: 2,
  published: 2_500,
  failed: 6,
  archived: 3,
};
function defaultResult(query: Query): QueryResult {
  switch (query.table) {
    case "workspace_members":
      return { data: { role: "owner" }, error: null };
    case "brands":
      return { data: null, count: 3, error: null };
    case "channels":
      return {
        data: null,
        count: eq(query, "status") === "connected" ? 1_203 : 2_404,
        error: null,
      };
    case "content":
      return { data: null, count: counts[eq(query, "status") as keyof typeof counts], error: null };
    case "scheduler_jobs":
      return {
        data: Array.from({ length: 5 }, (_, index) => ({
          id: `job-${index}`,
          status: "pending",
          scheduled_at: "2099-11-12T15:00:00Z",
        })),
        count: 1_205,
        error: null,
      };
    case "brain_recommendations":
    case "coach_recommendations":
    case "missions":
    case "domain_events":
    case "opportunities":
      return { data: [], error: null };
    case "brain_snapshots":
      return { data: { scores: { overall: 0 }, computed_at: at }, error: null };
    case "brain_answers":
      return { data: null, error: null };
    case "business_blueprints":
      return {
        data: { problem: "Real problem", audience: " ", promise: null, offer: "Offer" },
        error: null,
      };
    case "competitors":
      return { data: null, count: eq(query, "threat") === "high" ? 40 : 1_303, error: null };
    case "skill_assessments":
      return { data: [{ id: "assessment", score: 0, assessed_at: at }], count: 1_212, error: null };
    case "brain_memory_events":
      return { data: [{ id: "memory", created_at: at }], count: 2_010, error: null };
    case "brain_decisions":
      return { data: null, count: 1_300, error: null };
    case "health_metrics":
      return {
        data: {
          id: `health-${eq(query, "category")}`,
          category: eq(query, "category"),
          score: 50,
          computed_at: at,
        },
        error: null,
      };
    default:
      throw new Error(`Unexpected table ${query.table}`);
  }
}
function fixture(
  override: (query: Query, result: QueryResult) => QueryResult = (_, result) => result,
) {
  const queries: Query[] = [];
  const context = {
    userId,
    supabase: {
      from: (table: string) => {
        const query: Query = { table, actions: [] };
        queries.push(query);
        const builder: Record<string, unknown> = {};
        for (const name of ["select", "eq", "in", "gte", "order", "limit", "or", "is"])
          builder[name] = (...args: unknown[]) => {
            query.actions.push({ name, args });
            return builder;
          };
        const result = () => override(query, defaultResult(query));
        builder.maybeSingle = async () => {
          query.actions.push({ name: "maybeSingle", args: [] });
          return result();
        };
        builder.then = (
          resolve: (value: QueryResult) => unknown,
          reject: (reason: unknown) => unknown,
        ) => Promise.resolve().then(result).then(resolve, reject);
        return builder;
      },
    },
  };
  return { context, queries };
}
function run(fn: unknown, f: ReturnType<typeof fixture>, input: unknown = { workspaceId }) {
  return (fn as Handler)({ data: input, context: f.context });
}

describe.each(allHandlers)("dashboard %s read boundary", (_, fn) => {
  it("is GET, scopes membership to the caller and never generates a snapshot", async () => {
    const f = fixture();
    expect((fn as unknown as Handler).method).toBe("GET");
    await run(fn, f);
    expect(f.queries[0]).toMatchObject({ table: "workspace_members" });
    expect(eq(f.queries[0], "workspace_id")).toBe(workspaceId);
    expect(eq(f.queries[0], "user_id")).toBe(userId);
    expect(generators.buildSnapshot).not.toHaveBeenCalled();
    expect(
      f.queries
        .flatMap((q) => q.actions)
        .every((entry) => !["insert", "update", "upsert", "delete", "rpc"].includes(entry.name)),
    ).toBe(true);
    for (const query of f.queries.slice(1)) {
      if (query.table === "opportunities")
        expect(action(query, "or")?.args[0]).toBe(
          `workspace_id.is.null,workspace_id.eq.${workspaceId}`,
        );
      else expect(eq(query, "workspace_id"), query.table).toBe(workspaceId);
    }
  });
  it("rejects a nonmember before starting any data queries", async () => {
    const f = fixture((q, result) =>
      q.table === "workspace_members" ? { data: null, error: null } : result,
    );
    await expect(run(fn, f)).rejects.toThrow("forbidden");
    expect(f.queries.map((q) => q.table)).toEqual(["workspace_members"]);
  });
  it("does not treat a failed membership query as access", async () => {
    const f = fixture((q, result) =>
      q.table === "workspace_members"
        ? { data: null, error: { message: "membership unavailable" } }
        : result,
    );
    await expect(run(fn, f)).rejects.toThrow("membership unavailable");
    expect(f.queries).toHaveLength(1);
  });
  it("allows a viewer to read without a write/provider action", async () => {
    const f = fixture((q, result) =>
      q.table === "workspace_members" ? { data: { role: "viewer" }, error: null } : result,
    );
    await expect(run(fn, f)).resolves.toBeDefined();
  });
  it("validates the workspace ID before constructing any query", async () => {
    const f = fixture();
    await expect(
      run(fn, f, { workspaceId: `${workspaceId},workspace_id.not.is.null` }),
    ).rejects.toThrow();
    expect(f.queries).toHaveLength(0);
  });
});

describe("overview exact totals, statuses and preview", () => {
  it("uses exact head counts rather than bounded arrays, and keeps total 1205 separate from preview 5", async () => {
    const f = fixture();
    const data = (await run(getDashboard, f)) as {
      counts: Record<string, number>;
      contentByStatus: Record<string, number>;
      upcomingJobs: unknown[];
      checkedAt: string;
    };
    expect(data.counts).toEqual({
      brands: 3,
      channels: 2_404,
      channelsConnected: 1_203,
      content: 3_724,
      upcomingJobs: 1_205,
    });
    expect(data.contentByStatus).toEqual(counts);
    expect(data.upcomingJobs).toHaveLength(5);
    for (const query of f.queries.filter((q) =>
      ["brands", "channels", "content"].includes(q.table),
    ))
      expect(action(query, "select")?.args[1]).toEqual({ count: "exact", head: true });
    const content = f.queries.filter((q) => q.table === "content");
    expect(content.map((q) => eq(q, "status"))).toEqual(DASHBOARD_CONTENT_STATUSES);
    const jobs = f.queries.find((q) => q.table === "scheduler_jobs")!;
    expect(eq(jobs, "status")).toBe("pending");
    expect(action(jobs, "gte", "scheduled_at")?.args[1]).toBe(data.checkedAt);
    expect(action(jobs, "select")?.args[1]).toEqual({ count: "exact" });
    expect(action(jobs, "limit")?.args).toEqual([5]);
    expect(jobs.actions.filter((a) => a.name === "order").map((a) => a.args[0])).toEqual([
      "scheduled_at",
      "id",
    ]);
    expect(
      action(
        f.queries.find((q) => q.table === "missions")!,
        "in",
      )?.args,
    ).toEqual(["status", ["pending", "in_progress"]]);
  });
  it.each([
    "brands",
    "channels",
    "content",
    "scheduler_jobs",
    "brain_recommendations",
    "missions",
    "domain_events",
  ])("rejects read failures from %s rather than producing emptiness", async (table) => {
    const f = fixture((q, result) =>
      q.table === table
        ? { data: null, count: null, error: { message: "database unavailable" } }
        : result,
    );
    await expect(run(getDashboard, f)).rejects.toThrow("database unavailable");
  });
  it.each(["draft", "scheduled", "publishing", "published", "failed", "archived"])(
    "rejects a missing %s count instead of treating it as zero",
    async (status) => {
      const f = fixture((q, result) =>
        q.table === "content" && eq(q, "status") === status
          ? { data: null, count: null, error: null }
          : result,
      );
      await expect(run(getDashboard, f)).rejects.toThrow("counts were not returned");
    },
  );
  it.each(["brands", "channels", "scheduler_jobs"])("rejects a missing %s count", async (table) => {
    const f = fixture((q, result) => (q.table === table ? { ...result, count: null } : result));
    await expect(run(getDashboard, f)).rejects.toThrow("counts were not returned");
  });
  it("keeps confirmed zeros distinct from errors", async () => {
    const f = fixture((q, result) =>
      q.table === "workspace_members"
        ? result
        : "count" in result
          ? { ...result, count: 0, data: q.table === "scheduler_jobs" ? [] : null }
          : result,
    );
    await expect(run(getDashboard, f)).resolves.toMatchObject({
      counts: { brands: 0, content: 0, channels: 0, upcomingJobs: 0 },
      contentByStatus: {},
      upcomingJobs: [],
    });
  });
});

describe("saved advanced panels, not silent recalculation", () => {
  it.each([
    [getDashboardAnalysis, "brain_snapshots"],
    [getDashboardAnalysis, "brain_answers"],
    [getDashboardRecommendations, "coach_recommendations"],
    [getDashboardOpportunities, "opportunities"],
    [getDashboardBlueprint, "business_blueprints"],
    [getDashboardCompetitors, "competitors"],
    [getDashboardSkills, "skill_assessments"],
    [getDashboardJourney, "brain_memory_events"],
    [getDashboardJourney, "brain_decisions"],
  ])("propagates a failed underlying read from %s / %s", async (fn, table) => {
    const f = fixture((q, result) =>
      q.table === table
        ? { data: null, count: null, error: { message: "panel unavailable" } }
        : result,
    );
    await expect(run(fn, f)).rejects.toThrow("panel unavailable");
  });
  it("reads only the latest saved score and each of the five answers, with no generation", async () => {
    const f = fixture();
    await expect(run(getDashboardAnalysis, f)).resolves.toEqual({
      score: { overall: 0, computedAt: at },
      answers: [],
    });
    expect(
      f.queries.filter((q) => q.table === "brain_answers").map((q) => eq(q, "question")),
    ).toEqual(DASHBOARD_QUESTIONS);
    for (const q of f.queries.filter((q) =>
      ["brain_answers", "brain_snapshots"].includes(q.table),
    )) {
      expect(action(q, "limit")?.args).toEqual([1]);
      expect(q.actions.filter((a) => a.name === "order").map((a) => a.args[0])).toEqual([
        "computed_at",
        "id",
      ]);
    }
  });
  it("confirms absent analysis without inventing a score", async () => {
    const f = fixture((q, result) =>
      q.table === "brain_snapshots" ? { data: null, error: null } : result,
    );
    await expect(run(getDashboardAnalysis, f)).resolves.toEqual({ score: null, answers: [] });
  });
  it("rejects corrupt saved score payloads instead of replacing them with zero", async () => {
    const f = fixture((q, result) =>
      q.table === "brain_snapshots"
        ? { data: { scores: {}, computed_at: at }, error: null }
        : result,
    );
    await expect(run(getDashboardAnalysis, f)).rejects.toThrow();
  });
  it("filters trending status in the query, before its preview limit", async () => {
    const f = fixture();
    await run(getDashboardOpportunities, f);
    const q = f.queries.find((q) => q.table === "opportunities")!;
    expect(action(q, "in")?.args).toEqual(["status", ["exploding", "growing"]]);
    expect(q.actions.findIndex((a) => a.name === "in")).toBeLessThan(
      q.actions.findIndex((a) => a.name === "limit"),
    );
    expect(action(q, "limit")?.args).toEqual([3]);
  });
  it("does not count null/whitespace blueprint blocks as filled", async () => {
    await expect(run(getDashboardBlueprint, fixture())).resolves.toEqual({
      exists: true,
      filled: 2,
      total: 10,
    });
  });
  it("uses competitor totals larger than the server's default row limit", async () => {
    const f = fixture();
    await expect(run(getDashboardCompetitors, f)).resolves.toEqual({ total: 1_303, high: 40 });
    for (const q of f.queries.filter((q) => q.table === "competitors"))
      expect(action(q, "select")?.args[1]).toEqual({ count: "exact", head: true });
  });
  it("reads the caller's assessment count and last score, not an average of a truncated sample", async () => {
    const f = fixture();
    await expect(run(getDashboardSkills, f)).resolves.toEqual({
      total: 1_212,
      latest: { score: 0, assessedAt: at },
    });
    expect(
      eq(
        f.queries.find((q) => q.table === "skill_assessments")!,
        "user_id",
      ),
    ).toBe(userId);
  });
  it("counts the journey independently of its one-row date preview", async () => {
    await expect(run(getDashboardJourney, fixture())).resolves.toEqual({
      events: 2_010,
      decisions: 1_300,
      latestEventAt: at,
    });
  });
  it.each([
    [getDashboardSkills, "skill_assessments"],
    [getDashboardJourney, "brain_memory_events"],
  ])("rejects a missing latest row when the exact total is positive", async (fn, table) => {
    const f = fixture((q, result) =>
      q.table === table ? { data: [], count: 5, error: null } : result,
    );
    await expect(run(fn, f)).rejects.toThrow("was not returned");
  });
  it.each([
    [getDashboardSkills, "skill_assessments"],
    [getDashboardCompetitors, "competitors"],
    [getDashboardJourney, "brain_decisions"],
  ])("rejects an unreturned exact count in an advanced panel", async (fn, table) => {
    const f = fixture((q, result) => (q.table === table ? { ...result, count: null } : result));
    await expect(run(fn, f)).rejects.toThrow("counts were not returned");
  });
});

describe("latest health read is not a successful empty diagnosis on failure", () => {
  it.each(["marketing", "content", "brand", "channel", "growth"])(
    "rejects the failed %s category",
    async (category) => {
      const f = fixture((q, result) =>
        q.table === "health_metrics" && eq(q, "category") === category
          ? { data: null, error: { message: "health unavailable" } }
          : result,
      );
      await expect(run(getLatestHealth, f)).rejects.toThrow("health unavailable");
    },
  );
  it("returns a genuinely absent history as an empty successful list", async () => {
    const f = fixture((q, result) =>
      q.table === "health_metrics" ? { data: null, error: null } : result,
    );
    await expect(run(getLatestHealth, f)).resolves.toEqual([]);
  });
  it.each([-1, 101, NaN, null, "0"])("rejects malformed score %s", async (score) => {
    const f = fixture((q, result) =>
      q.table === "health_metrics" ? { data: { score }, error: null } : result,
    );
    await expect(run(getLatestHealth, f)).rejects.toThrow("supported range");
  });
});
