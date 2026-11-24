import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  at,
  evidence,
  healthRecords,
  id,
  input,
  otherWorkspace,
  scoreRecord,
  userId,
  workspaceId,
} from "@/lib/diagnostics/__tests__/fixtures";

type Query = { table: string; actions: Array<{ name: string; args: unknown[] }> };
type Result = { data?: unknown; count?: number | null; error?: unknown };
type Handler = ((args: { data: unknown; context: unknown }) => Promise<unknown>) & {
  method: string;
};
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
// Transport tests are preauthenticated and synthetic, not Auth/RLS/Postgres attestation.
import { computeDigitalScore, getLatestScore } from "../score.functions";
import { computeHealth, getLatestHealth } from "../health.functions";

const action = (query: Query, name: string, column?: string) =>
  query.actions.find(
    (entry) => entry.name === name && (column === undefined || entry.args[0] === column),
  );
const eq = (query: Query, column: string) => action(query, "eq", column)?.args[1];
function fixture(override: (query: Query, result: Result) => Result = (_, result) => result) {
  const queries: Query[] = [];
  const context = {
    userId,
    supabase: {
      from: (table: string) => {
        const query: Query = { table, actions: [] };
        queries.push(query);
        const builder: Record<string, unknown> = {};
        for (const name of ["select", "eq", "order", "limit", "insert", "delete", "lte"])
          builder[name] = (...args: unknown[]) => {
            query.actions.push({ name, args });
            return builder;
          };
        const value = () => {
          let result: Result;
          const write = action(query, "insert")?.args[0];
          const source = evidence();
          if (table === "workspace_members") result = { data: { role: "owner" }, error: null };
          else if (table === "brands" || table === "channels" || table === "content")
            result = source[table];
          else if (table === "scheduler_jobs") result = source.jobs;
          else if (table === "digital_scores")
            result = { data: write ?? scoreRecord(), error: null };
          else if (table === "health_metrics")
            result = {
              data: write ?? healthRecords().find((row) => row.category === eq(query, "category")),
              error: null,
            };
          else if (table === "brain_snapshots") result = { data: write, error: null };
          else if (table === "brain_answers") result = { data: null, count: 0, error: null };
          else throw new Error(`Unexpected diagnostic table ${table}`);
          return override(query, result);
        };
        builder.single = async () => {
          query.actions.push({ name: "single", args: [] });
          return value();
        };
        builder.maybeSingle = async () => {
          query.actions.push({ name: "maybeSingle", args: [] });
          return value();
        };
        builder.then = (
          resolve: (result: Result) => unknown,
          reject: (error: unknown) => unknown,
        ) => Promise.resolve().then(value).then(resolve, reject);
        return builder;
      },
    },
  };
  return { queries, context };
}
const invoke = (fn: unknown, f: ReturnType<typeof fixture>, data: unknown = input) =>
  (fn as Handler)({ data, context: f.context });
const mutations = (f: ReturnType<typeof fixture>) =>
  f.queries.filter((query) => action(query, "insert") || action(query, "delete"));
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(at));
});
afterEach(() => {
  vi.useRealTimers();
});

const endpoints = [
  ["score read", getLatestScore, "GET"],
  ["health read", getLatestHealth, "GET"],
  ["score compute", computeDigitalScore, "POST"],
  ["health compute", computeHealth, "POST"],
] as const;

describe.each(endpoints)("%s boundary", (_, fn, method) => {
  it("checks caller membership before any domain read/write and uses the declared method", async () => {
    const f = fixture();
    expect((fn as unknown as Handler).method).toBe(method);
    await invoke(fn, f);
    expect(f.queries[0].table).toBe("workspace_members");
    expect(eq(f.queries[0], "workspace_id")).toBe(workspaceId);
    expect(eq(f.queries[0], "user_id")).toBe(userId);
  });
  it.each([null, "unknown", "", "superadmin"])(
    "fails closed for unrecognized membership %s",
    async (role) => {
      const f = fixture((query, result) =>
        query.table === "workspace_members"
          ? { data: role === null ? null : { role }, error: null }
          : result,
      );
      await expect(invoke(fn, f)).rejects.toThrow("forbidden");
      expect(f.queries).toHaveLength(1);
    },
  );
  it("does not turn membership failure into an allowed empty read", async () => {
    const f = fixture((query, result) =>
      query.table === "workspace_members"
        ? { data: null, error: { message: "membership unavailable" } }
        : result,
    );
    await expect(invoke(fn, f)).rejects.toThrow("membership unavailable");
    expect(f.queries).toHaveLength(1);
  });
  it("validates a workspace before constructing any query", async () => {
    const f = fixture();
    await expect(invoke(fn, f, { ...input, workspaceId: workspaceId + ",evil" })).rejects.toThrow();
    expect(f.queries).toHaveLength(0);
  });
});

describe.each([
  ["score", getLatestScore],
  ["health", getLatestHealth],
] as const)("saved %s GET", (kind, fn) => {
  it("allows a viewer to read but never mutates or computes sources", async () => {
    const f = fixture((query, result) =>
      query.table === "workspace_members" ? { data: { role: "viewer" }, error: null } : result,
    );
    await invoke(fn, f, { workspaceId });
    expect(mutations(f)).toHaveLength(0);
    expect(
      f.queries.every((query) =>
        ["workspace_members", "digital_scores", "health_metrics"].includes(query.table),
      ),
    ).toBe(true);
  });
  it("orders latest rows deterministically by time and ID in the requested workspace", async () => {
    const f = fixture();
    await invoke(fn, f, { workspaceId });
    for (const query of f.queries.slice(1)) {
      expect(eq(query, "workspace_id")).toBe(workspaceId);
      expect(action(query, "limit")?.args).toEqual([1]);
      expect(
        query.actions.filter((entry) => entry.name === "order").map((entry) => entry.args),
      ).toEqual([
        ["computed_at", { ascending: false }],
        ["id", { ascending: false }],
      ]);
    }
  });
  it("only accepts explicit null as absent history", async () => {
    const table = kind === "score" ? "digital_scores" : "health_metrics";
    const f = fixture((query, result) =>
      query.table === table ? { data: null, error: null } : result,
    );
    await expect(invoke(fn, f)).resolves.toEqual(kind === "score" ? null : []);
    const missing = fixture((query, result) =>
      query.table === table ? { data: undefined, error: null } : result,
    );
    await expect(invoke(fn, missing)).rejects.toThrow();
  });
  it("rejects read errors instead of pretending no history exists", async () => {
    const f = fixture((query, result) =>
      query.table === (kind === "score" ? "digital_scores" : "health_metrics")
        ? { data: null, error: { message: "read unavailable" } }
        : result,
    );
    await expect(invoke(fn, f)).rejects.toThrow("read unavailable");
  });
  it("rejects a foreign record even if the transport returns it successfully", async () => {
    const f = fixture((query, result) =>
      ["digital_scores", "health_metrics"].includes(query.table)
        ? { data: { ...(result.data as object), workspace_id: otherWorkspace }, error: null }
        : result,
    );
    await expect(invoke(fn, f)).rejects.toThrow();
  });
});

describe.each([
  ["score", computeDigitalScore],
  ["health", computeHealth],
] as const)("explicit %s POST", (kind, fn) => {
  it("rejects viewer before reading calculation sources", async () => {
    const f = fixture((query, result) =>
      query.table === "workspace_members" ? { data: { role: "viewer" }, error: null } : result,
    );
    await expect(invoke(fn, f)).rejects.toThrow("forbidden");
    expect(f.queries).toHaveLength(1);
  });
  it.each(["owner", "admin", "editor"])(
    "allows a recognized %s and uses just the four versioned sources",
    async (role) => {
      const f = fixture((query, result) =>
        query.table === "workspace_members" ? { data: { role }, error: null } : result,
      );
      await expect(invoke(fn, f)).resolves.toBeDefined();
      const sources = f.queries.filter((query) =>
        ["brands", "channels", "content", "scheduler_jobs"].includes(query.table),
      );
      expect(sources).toHaveLength(4);
      for (const query of sources) {
        expect(action(query, "select")?.args[1]).toEqual({ count: "exact" });
        expect(eq(query, "workspace_id")).toBe(workspaceId);
        expect(action(query, "limit")?.args).toEqual([500]);
        expect(
          query.actions.filter((entry) => entry.name === "order").map((entry) => entry.args[0]),
        ).toEqual([query.table === "scheduler_jobs" ? "updated_at" : "created_at", "id"]);
      }
      expect(
        f.queries.some((query) =>
          [
            "user_profile_digital",
            "analytics_snapshots",
            "opportunities",
            "business_blueprints",
            "competitors",
          ].includes(query.table),
        ),
      ).toBe(false);
    },
  );
  it("requires a new calculation identifier before issuing any query", async () => {
    const f = fixture();
    await expect(invoke(fn, f, { workspaceId })).rejects.toThrow();
    expect(f.queries).toHaveLength(0);
  });
  it.each(["brands", "channels", "content", "scheduler_jobs"])(
    "does not write any diagnosis when %s is unavailable",
    async (table) => {
      const f = fixture((query, result) =>
        query.table === table
          ? { data: null, count: null, error: { message: "source unavailable" } }
          : result,
      );
      await expect(invoke(fn, f)).rejects.toThrow("source");
      expect(mutations(f)).toHaveLength(0);
    },
  );
  it.each(["brands", "channels", "content", "scheduler_jobs"])(
    "does not write a partial/missing exact %s slice",
    async (table) => {
      const f = fixture((query, result) =>
        query.table === table ? { ...result, count: 1205 } : result,
      );
      await expect(invoke(fn, f)).rejects.toThrow("slice");
      expect(mutations(f)).toHaveLength(0);
    },
  );
  it("does not claim success or attempt secondary writes after a failed primary write", async () => {
    const table = kind === "score" ? "digital_scores" : "health_metrics";
    const f = fixture((query, result) =>
      query.table === table ? { data: null, error: { message: "primary write failed" } } : result,
    );
    await expect(invoke(fn, f)).rejects.toThrow("primary write failed");
    expect(mutations(f).map((query) => query.table)).toEqual([table]);
  });
  it("rejects an empty insert receipt and never retries its POST", async () => {
    const table = kind === "score" ? "digital_scores" : "health_metrics";
    const f = fixture((query, result) =>
      query.table === table ? { data: kind === "score" ? null : [], error: null } : result,
    );
    await expect(invoke(fn, f)).rejects.toThrow();
    expect(mutations(f).map((query) => query.table)).toEqual([table]);
  });
});

describe("confirmed primary score and independent secondary receipts", () => {
  it("persists the primary first, then a scoped mirror, then invalidates answers", async () => {
    const f = fixture();
    const result = (await invoke(computeDigitalScore, f)) as {
      score: { id: string };
      snapshotRecorded: boolean;
      answersInvalidated: boolean;
    };
    expect(result).toMatchObject({
      score: { id: input.calculationId },
      snapshotRecorded: true,
      answersInvalidated: true,
    });
    expect(mutations(f).map((query) => query.table)).toEqual([
      "digital_scores",
      "brain_snapshots",
      "brain_answers",
    ]);
    const snapshot = action(mutations(f)[1], "insert")!.args[0] as Record<string, unknown>;
    expect(snapshot).toMatchObject({
      workspace_id: workspaceId,
      id: input.calculationId,
      signals: [],
      snapshot: { source: "diagnostics", diagnostic: { model: "velt-records-v2" } },
    });
    const invalidation = mutations(f)[2];
    expect(eq(invalidation, "workspace_id")).toBe(workspaceId);
    expect(action(invalidation, "delete")?.args).toEqual([{ count: "exact" }]);
    expect(action(invalidation, "lte", "computed_at")?.args[1]).toBe(at);
  });
  it.each(["error", "throw", "empty", "wrongScope"])(
    "returns primary success with a mirror warning for %s, without cache delete or duplicate score",
    async (mode) => {
      const f = fixture((query, result) => {
        if (query.table !== "brain_snapshots") return result;
        if (mode === "throw") throw new Error("mirror offline");
        return mode === "error"
          ? { data: null, error: { message: "mirror denied" } }
          : {
              data:
                mode === "empty" ? null : { id: input.calculationId, workspace_id: otherWorkspace },
              error: null,
            };
      });
      await expect(invoke(computeDigitalScore, f)).resolves.toMatchObject({
        score: { id: input.calculationId },
        snapshotRecorded: false,
        answersInvalidated: false,
      });
      expect(mutations(f).map((query) => query.table)).toEqual([
        "digital_scores",
        "brain_snapshots",
      ]);
    },
  );
  it.each(["error", "throw", "missingCount", "invalidCount"])(
    "returns primary success with a cache warning for %s",
    async (mode) => {
      const f = fixture((query, result) => {
        if (query.table !== "brain_answers") return result;
        if (mode === "throw") throw new Error("cache offline");
        return mode === "error"
          ? { data: null, error: { message: "cache denied" } }
          : { data: null, error: null, count: mode === "missingCount" ? null : -1 };
      });
      await expect(invoke(computeDigitalScore, f)).resolves.toMatchObject({
        snapshotRecorded: true,
        answersInvalidated: false,
      });
      expect(mutations(f).map((query) => query.table)).toEqual([
        "digital_scores",
        "brain_snapshots",
        "brain_answers",
      ]);
    },
  );
  it("does not mistake a different saved score for confirmation of this input", async () => {
    const f = fixture((query, result) =>
      query.table === "digital_scores"
        ? { data: { ...(result.data as object), overall: 1 }, error: null }
        : result,
    );
    await expect(invoke(computeDigitalScore, f)).rejects.toThrow();
    expect(mutations(f)).toHaveLength(1);
  });
  it("verifies all five inserted health rows, not simply any returned array", async () => {
    const f = fixture((query, result) =>
      query.table === "health_metrics"
        ? { data: (result.data as unknown[]).slice(1), error: null }
        : result,
    );
    await expect(invoke(computeHealth, f)).rejects.toThrow("five inserted");
    expect(mutations(f)).toHaveLength(1);
  });
  it("does not introduce a shared Brain/AI dependency or service-role client", () => {
    for (const file of [
      "src/lib/api/health.functions.ts",
      "src/lib/api/score.functions.ts",
      "src/lib/diagnostics/build.server.ts",
    ])
      expect(readFileSync(file, "utf8")).not.toMatch(
        /from ["']@\/lib\/brain\/|supabaseAdmin|runAIInsights|fetch\(/,
      );
  });
});
