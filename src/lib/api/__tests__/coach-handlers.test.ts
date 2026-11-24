import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  at,
  evidence,
  id,
  input,
  journey,
  later,
  legacy,
  otherWorkspace,
  recommendation,
  userId,
  workspaceId,
} from "@/lib/coach/__tests__/fixtures";
import { COACH_FILTERS, coachMethod } from "@/lib/coach/contracts";

type Query = { table: string; actions: Array<{ name: string; args: unknown[] }> };
type Result = {
  data: unknown;
  count?: number | null;
  error: { message: string; code?: string } | null;
};
type Handler = ((args: { data: unknown; context: unknown }) => Promise<unknown>) & {
  method: string;
  middlewareCount: number;
};
vi.mock("@tanstack/react-start", () => ({
  createServerFn: ({ method }: { method: string }) => {
    let parse = (value: unknown) => value,
      middlewareCount = 0;
    const builder = {
      middleware: (items: unknown[]) => {
        middlewareCount = items.length;
        return builder;
      },
      inputValidator: (fn: typeof parse) => {
        parse = fn;
        return builder;
      },
      handler: (fn: Handler) =>
        Object.assign(
          async (args: Parameters<Handler>[0]) => fn({ ...args, data: parse(args.data) }),
          { method, middlewareCount },
        ),
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
// These exports must not be reached by either Coach generator. No AI/network in synthetic tests.
vi.mock("@/lib/brain/brain", () =>
  Object.fromEntries(
    [
      "loadContext",
      "runEngines",
      "computeScores",
      "answerQuestion",
      "aggregateSignals",
      "aggregateActions",
    ].map((name) => [
      name,
      vi.fn(() => {
        throw new Error("Unexpected legacy Brain engine " + name);
      }),
    ]),
  ),
);
vi.mock("@/lib/brain/ai-insights.server", () => ({
  runAIInsights: vi.fn(() => {
    throw new Error("Unexpected AI call");
  }),
}));
import {
  generateRecommendations,
  listJourney,
  listRecommendations,
  updateRecommendation,
} from "../coach.functions";
import { brainRecommend } from "../brain-core.functions";

const action = (q: Query, name: string, column?: string) =>
  q.actions.find((a) => a.name === name && (column === undefined || a.args[0] === column));
const eq = (q: Query, column: string) => action(q, "eq", column)?.args[1];
const mutates = (q: Query) =>
  q.actions.some((a) => ["insert", "update", "delete", "upsert"].includes(a.name));
function defaultResult(q: Query): Result {
  if (q.table === "workspace_members") return { data: { role: "owner" }, error: null };
  const source = evidence();
  if (q.table === "brands" || q.table === "channels" || q.table === "content")
    return source[q.table] as Result;
  if (q.table === "scheduler_jobs") return source.jobs as Result;
  const inserted = action(q, "insert")?.args[0];
  if (inserted) return { data: inserted, error: null };
  const patch = action(q, "update")?.args[0];
  if (patch)
    return { data: { ...recommendation(), updated_at: later, ...(patch as object) }, error: null };
  if (q.table === "coach_recommendations") {
    const row = legacy(0, {
      completed_at: action(q, "not", "completed_at") ? later : null,
      dismissed_at: action(q, "not", "dismissed_at") ? later : null,
    });
    return {
      data: Number(action(q, "range")?.args[0] ?? 0) > 0 ? [] : [row],
      count: 1,
      error: null,
    };
  }
  if (q.table === "brain_memory_events")
    return {
      data: Number(action(q, "range")?.args[0] ?? 0) > 0 ? [] : [journey()],
      count: 1,
      error: null,
    };
  throw new Error("Unexpected Coach table " + q.table);
}
function fixture(override: (q: Query, r: Result) => Result = (_, result) => result) {
  const queries: Query[] = [];
  return {
    queries,
    context: {
      userId,
      supabase: {
        from: (table: string) => {
          const q: Query = { table, actions: [] };
          queries.push(q);
          const b: Record<string, unknown> = {};
          for (const name of [
            "select",
            "eq",
            "is",
            "not",
            "order",
            "limit",
            "range",
            "insert",
            "update",
            "delete",
            "upsert",
          ])
            b[name] = (...args: unknown[]) => {
              q.actions.push({ name, args });
              return b;
            };
          const result = () => override(q, defaultResult(q));
          b.single = async () => {
            q.actions.push({ name: "single", args: [] });
            return result();
          };
          b.maybeSingle = async () => {
            q.actions.push({ name: "maybeSingle", args: [] });
            return result();
          };
          b.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve().then(result).then(resolve, reject);
          return b;
        },
      },
    },
  };
}
const run = (fn: unknown, f: ReturnType<typeof fixture>, data: unknown = { workspaceId }) =>
  (fn as Handler)({ data, context: f.context });
const statusInput = {
  workspaceId,
  id: recommendation().id,
  expectedUpdatedAt: at,
  action: "complete" as const,
};
const endpoints = [
  ["recommendations", listRecommendations, { workspaceId }, "GET"],
  ["journey", listJourney, { workspaceId }, "GET"],
  ["native generation", generateRecommendations, input, "POST"],
  ["legacy entry generation", brainRecommend, input, "POST"],
  ["manual state", updateRecommendation, statusInput, "POST"],
] as const;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(at));
});
afterEach(() => {
  vi.useRealTimers();
});

describe.each(endpoints)("Coach %s boundary", (_, fn, data, method) => {
  it("declares Auth middleware, validates input and checks exact caller/workspace before domain work", async () => {
    const f = fixture();
    await run(fn, f, data);
    expect((fn as unknown as Handler).method).toBe(method);
    expect((fn as unknown as Handler).middlewareCount).toBe(1);
    expect(f.queries[0].table).toBe("workspace_members");
    expect(eq(f.queries[0], "workspace_id")).toBe(workspaceId);
    expect(eq(f.queries[0], "user_id")).toBe(userId);
  });
  it.each([null, "unknown", "superadmin", "service_role", ""])(
    "fails closed before domain work for membership %s",
    async (role) => {
      const f = fixture((q, r) =>
        q.table === "workspace_members" ? { ...r, data: role === null ? null : { role } } : r,
      );
      await expect(run(fn, f, data)).rejects.toThrow("forbidden");
      expect(f.queries).toHaveLength(1);
    },
  );
  it("propagates membership read error without permitting a query or write", async () => {
    const f = fixture((q, r) =>
      q.table === "workspace_members" ? { ...r, error: { message: "membership unavailable" } } : r,
    );
    await expect(run(fn, f, data)).rejects.toThrow("membership unavailable");
    expect(f.queries).toHaveLength(1);
  });
  it("rejects malformed workspace before constructing any database query", async () => {
    const f = fixture();
    await expect(run(fn, f, { ...data, workspaceId: "invalid" })).rejects.toThrow();
    expect(f.queries).toHaveLength(0);
  });
});

const reads = [
  ["recommendations", listRecommendations, "coach_recommendations"],
  ["journey", listJourney, "brain_memory_events"],
] as const;
describe.each(reads)("Coach %s GET", (name, fn, table) => {
  it.each(["owner", "admin", "editor", "viewer"])(
    "allows %s to read exact bounded scoped history without any write/source generation",
    async (role) => {
      const f = fixture((q, r) => (q.table === "workspace_members" ? { ...r, data: { role } } : r));
      const result = await run(fn, f);
      expect(result).toMatchObject({ workspaceId, page: 1, pageSize: 20, total: 1 });
      expect(f.queries.map((q) => q.table)).toEqual(["workspace_members", table]);
      expect(f.queries.some(mutates)).toBe(false);
      const q = f.queries[1];
      expect(eq(q, "workspace_id")).toBe(workspaceId);
      expect(action(q, "select")?.args).toEqual(["*", { count: "exact", head: false }]);
      expect(action(q, "range")?.args).toEqual([0, 19]);
      expect(q.actions.filter((a) => a.name === "order").map((a) => a.args)).toEqual([
        ["created_at", { ascending: false }],
        ...(name === "recommendations" ? [["score", { ascending: false }]] : []),
        ["id", { ascending: false }],
      ]);
    },
  );
  it("does not truncate an exact total above the REST row cap or claim the current page is the whole list", async () => {
    const f = fixture((q, r) =>
      q.table === table
        ? {
            ...r,
            count: 1205,
            data: Array.from({ length: 20 }, (_, i) =>
              name === "recommendations" ? legacy(i) : journey(i),
            ),
          }
        : r,
    );
    expect(await run(fn, f, { workspaceId, page: 3 })).toMatchObject({ total: 1205, page: 3 });
    expect(action(f.queries[1], "range")?.args).toEqual([40, 59]);
  });
  it.each([
    { data: null, count: 0 },
    { data: [], count: null },
    { data: [], count: 1 },
    { data: [], count: -1 },
    { data: [], count: 0, error: { message: "read failed" } },
  ])("does not convert failed/incomplete history to empty success: %#", async (result) => {
    const f = fixture((q, r) => (q.table === table ? { error: null, ...result } : r));
    await expect(run(fn, f)).rejects.toThrow();
    expect(f.queries.some(mutates)).toBe(false);
  });
  it("accepts explicit counted absence and an explicitly vanished later page", async () => {
    const f = fixture((q, r) => (q.table === table ? { data: [], count: 0, error: null } : r));
    expect(await run(fn, f)).toMatchObject({ total: 0, items: [] });
    const out = fixture();
    expect(await run(fn, out, { workspaceId, page: 2 })).toMatchObject({
      items: [],
      total: 1,
      page: 2,
    });
  });
  it.each([0, 1, 20])(
    "only treats PGRST103 as a vanished later page after exact scoped count %s proves it",
    async (total) => {
      const f = fixture((q, r) =>
        q.table !== table
          ? r
          : action(q, "range")
            ? { data: null, count: null, error: { code: "PGRST103", message: "bad range" } }
            : { data: null, count: total, error: null },
      );
      expect(await run(fn, f, { workspaceId, page: 2 })).toMatchObject({
        items: [],
        total,
        page: 2,
      });
      expect(f.queries).toHaveLength(3);
      expect(action(f.queries[2], "select")?.args).toEqual(["*", { count: "exact", head: true }]);
      expect(eq(f.queries[2], "workspace_id")).toBe(workspaceId);
    },
  );
  it.each([null, -1, 21])(
    "does not hide a range failure if recount %s does not confirm absence",
    async (count) => {
      const f = fixture((q, r) =>
        q.table !== table
          ? r
          : action(q, "range")
            ? { data: null, error: { code: "PGRST103", message: "bad range" } }
            : { data: null, count, error: null },
      );
      await expect(run(fn, f, { workspaceId, page: 2 })).rejects.toThrow();
    },
  );
  it("does not reinterpret first-page range errors or a failed recount as empty history", async () => {
    const f = fixture((q, r) =>
      q.table === table ? { data: null, error: { code: "PGRST103", message: "bad range" } } : r,
    );
    await expect(run(fn, f)).rejects.toThrow("bad range");
    expect(f.queries).toHaveLength(2);
    const failed = fixture((q, r) =>
      q.table !== table
        ? r
        : action(q, "range")
          ? { data: null, error: { code: "PGRST103", message: "bad range" } }
          : { data: null, count: 0, error: { message: "count unavailable" } },
    );
    await expect(run(fn, failed, { workspaceId, page: 2 })).rejects.toThrow("count unavailable");
  });
});

describe("Coach status filter", () => {
  it.each(COACH_FILTERS)(
    "uses consistent timestamp predicates for %s in both page and fallback count",
    async (status) => {
      const f = fixture();
      await run(listRecommendations, f, { workspaceId, status });
      const predicates = (q: Query) =>
        q.actions
          .filter((a) => a.name === "is" || a.name === "not")
          .map((a) => [a.name, ...a.args]);
      const expected =
        status === "open"
          ? [
              ["is", "completed_at", null],
              ["is", "dismissed_at", null],
            ]
          : status === "completed"
            ? [
                ["not", "completed_at", "is", null],
                ["is", "dismissed_at", null],
              ]
            : status === "dismissed"
              ? [
                  ["not", "dismissed_at", "is", null],
                  ["is", "completed_at", null],
                ]
              : status === "conflicted"
                ? [
                    ["not", "completed_at", "is", null],
                    ["not", "dismissed_at", "is", null],
                  ]
                : [];
      expect(predicates(f.queries[1])).toEqual(expected);
      const out = fixture((q, r) =>
        q.table !== "coach_recommendations"
          ? r
          : action(q, "range")
            ? { data: null, error: { code: "PGRST103", message: "range" } }
            : { data: null, count: 0, error: null },
      );
      await run(listRecommendations, out, { workspaceId, status, page: 2 });
      expect(predicates(out.queries[2])).toEqual(expected);
    },
  );
});

const generators = [
  ["native", generateRecommendations],
  ["legacy entry", brainRecommend],
] as const;
describe.each(generators)("%s additive Coach generation", (_, fn) => {
  it.each(["owner", "admin", "editor"])(
    "allows %s and confirms one complete batch before secondary event",
    async (role) => {
      const f = fixture((q, r) => (q.table === "workspace_members" ? { ...r, data: { role } } : r));
      const result = (await run(fn, f, input)) as { generated: number; eventRecorded: boolean };
      expect(result).toMatchObject({ generated: 4, eventRecorded: true });
      expect(f.queries.map((q) => q.table)).toEqual([
        "workspace_members",
        "brands",
        "channels",
        "content",
        "scheduler_jobs",
        "coach_recommendations",
        "brain_memory_events",
      ]);
      const saved = action(f.queries[5], "insert")?.args[0] as ReturnType<typeof recommendation>[];
      expect(saved).toHaveLength(4);
      expect(
        saved.every(
          (row) =>
            row.workspace_id === workspaceId &&
            row.user_id === userId &&
            coachMethod(row)?.coach.evidence.calculationId === input.batchId &&
            row.completed_at === null &&
            row.dismissed_at === null,
        ),
      ).toBe(true);
      expect(
        f.queries.some((q) => action(q, "update") || action(q, "delete") || action(q, "upsert")),
      ).toBe(false);
      expect(action(f.queries[5], "select")?.args).toEqual(["*"]);
      for (const q of f.queries.slice(1, 5)) {
        expect(eq(q, "workspace_id")).toBe(workspaceId);
        expect(action(q, "select")?.args[1]).toEqual({ count: "exact" });
        expect(action(q, "limit")?.args).toEqual([500]);
      }
    },
  );
  it("rejects viewer before reading generation sources", async () => {
    const f = fixture((q, r) =>
      q.table === "workspace_members" ? { ...r, data: { role: "viewer" } } : r,
    );
    await expect(run(fn, f, input)).rejects.toThrow("forbidden");
    expect(f.queries).toHaveLength(1);
  });
  it("requires a batch ID even on the legacy entry, rather than silently retaining old destructive semantics", async () => {
    const f = fixture();
    await expect(run(fn, f)).rejects.toThrow();
    expect(f.queries).toHaveLength(0);
  });
  it.each(["brands", "channels", "content", "scheduler_jobs"])(
    "does not insert/dismiss anything after %s failure",
    async (table) => {
      const f = fixture((q, r) =>
        q.table === table
          ? { data: null, count: null, error: { message: "source unavailable" } }
          : r,
      );
      await expect(run(fn, f, input)).rejects.toThrow();
      expect(f.queries.some(mutates)).toBe(false);
    },
  );
  it.each([null, 1205])(
    "does not generate on a missing/incomplete exact source count %#",
    async (count) => {
      const f = fixture((q, r) => (q.table === "content" ? { ...r, count } : r));
      await expect(run(fn, f, input)).rejects.toThrow();
      expect(f.queries.some(mutates)).toBe(false);
    },
  );
  it.each(["error", "missing", "partial", "wrongId", "wrongWorkspace", "changedBody", "closed"])(
    "rejects unconfirmed primary batch %s and never attempts its secondary event",
    async (kind) => {
      const f = fixture((q, r) => {
        if (q.table !== "coach_recommendations") return r;
        const rows = r.data as ReturnType<typeof recommendation>[];
        if (kind === "error") return { data: null, error: { message: "insert unavailable" } };
        if (kind === "missing") return { data: null, error: null };
        if (kind === "partial") return { ...r, data: rows.slice(1) };
        return {
          ...r,
          data: rows.map((row, index) =>
            index
              ? row
              : {
                  ...row,
                  ...(kind === "wrongId"
                    ? { id: id(999) }
                    : kind === "wrongWorkspace"
                      ? { workspace_id: otherWorkspace }
                      : kind === "changedBody"
                        ? { body: "Changed claim" }
                        : { completed_at: later }),
                },
          ),
        };
      });
      await expect(run(fn, f, input)).rejects.toThrow();
      expect(f.queries.some((q) => q.table === "brain_memory_events")).toBe(false);
      expect(f.queries.some((q) => action(q, "update") || action(q, "delete"))).toBe(false);
    },
  );
  it.each(["error", "throw", "missing", "wrongWorkspace", "wrongCount", "wrongId", "wrongSubject"])(
    "keeps primary success and reports only secondary warning for event %s",
    async (kind) => {
      const f = fixture((q, r) => {
        if (q.table !== "brain_memory_events") return r;
        if (kind === "throw") throw new Error("event transport lost");
        if (kind === "error") return { data: null, error: { message: "event unavailable" } };
        if (kind === "missing") return { data: null, error: null };
        const row = r.data as ReturnType<typeof journey>;
        return {
          ...r,
          data: {
            ...row,
            ...(kind === "wrongWorkspace"
              ? { workspace_id: otherWorkspace }
              : kind === "wrongId"
                ? { id: id(999) }
                : kind === "wrongSubject"
                  ? { subject: "Other event" }
                  : { payload: { source: "velt-coach-v2", batchId: input.batchId, count: 99 } }),
          },
        };
      });
      await expect(run(fn, f, input)).resolves.toMatchObject({
        generated: 4,
        eventRecorded: false,
      });
      expect(f.queries.filter((q) => q.table === "coach_recommendations")).toHaveLength(1);
    },
  );
});

describe("manual Coach CAS", () => {
  it.each(["complete", "dismiss"] as const)(
    "records %s only for exact ID/workspace/open version and confirms the returned line",
    async (actionName) => {
      const f = fixture();
      await run(updateRecommendation, f, { ...statusInput, action: actionName });
      const q = f.queries[1];
      expect(q.table).toBe("coach_recommendations");
      expect(eq(q, "workspace_id")).toBe(workspaceId);
      expect(eq(q, "id")).toBe(statusInput.id);
      expect(eq(q, "updated_at")).toBe(at);
      expect(action(q, "is", "completed_at")?.args).toEqual(["completed_at", null]);
      expect(action(q, "is", "dismissed_at")?.args).toEqual(["dismissed_at", null]);
      expect(action(q, "update")?.args).toEqual([
        actionName === "complete" ? { completed_at: at } : { dismissed_at: at },
      ]);
      expect(action(q, "select")?.args).toEqual(["*"]);
      expect(action(q, "single")).toBeDefined();
      expect(f.queries).toHaveLength(2);
    },
  );
  it("denies viewer before status query", async () => {
    const f = fixture((q, r) =>
      q.table === "workspace_members" ? { ...r, data: { role: "viewer" } } : r,
    );
    await expect(run(updateRecommendation, f, statusInput)).rejects.toThrow("forbidden");
    expect(f.queries).toHaveLength(1);
  });
  it.each([
    null,
    {},
    [],
    recommendation(),
    recommendation(0, { completed_at: later, dismissed_at: later }),
    recommendation(1, { completed_at: at }),
    recommendation(0, { completed_at: later }),
    recommendation(0, { completed_at: at, workspace_id: otherWorkspace }),
  ])("does not report success for empty/conflicted/foreign/wrong-time result: %#", async (data) => {
    const f = fixture((q, r) => (q.table === "coach_recommendations" ? { data, error: null } : r));
    await expect(run(updateRecommendation, f, statusInput)).rejects.toThrow();
  });
  it("propagates zero-row CAS failure, rather than retrying the POST or writing history", async () => {
    const f = fixture((q, r) =>
      q.table === "coach_recommendations"
        ? { data: null, error: { code: "PGRST116", message: "zero rows / stale version" } }
        : r,
    );
    await expect(run(updateRecommendation, f, statusInput)).rejects.toThrow("zero rows");
    expect(f.queries).toHaveLength(2);
  });
});
