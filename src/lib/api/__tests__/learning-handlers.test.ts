import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  at,
  earlier,
  input,
  learningPath,
  operationId,
  otherPath,
  otherUser,
  pid,
  progress,
  uid,
} from "@/lib/learning/__tests__/fixtures";
import type { LearningPath, LearningProgress } from "@/lib/learning/contracts";
type Query = { table: string; actions: Array<{ name: string; args: unknown[] }> };
type Result = {
  data: unknown;
  count: number | null;
  error: { message: string; code?: string } | null;
};
type Handler = ((args: { data?: unknown; context: unknown }) => Promise<unknown>) & {
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
      validator: (fn: typeof parse) => {
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
import {
  listLearningPaths,
  listMyProgress,
  setMilestoneCompletion,
  toggleMilestone,
} from "../learning.functions";
const action = (q: Query, name: string, column?: string) =>
  q.actions.find((a) => a.name === name && (column === undefined || a.args[0] === column));
const writing = (q: Query) => !!(action(q, "insert") || action(q, "update"));
function fixture(
  options: {
    paths?: LearningPath[];
    rows?: LearningProgress[];
    override?: (q: Query, result: Result) => Result;
  } = {},
) {
  const queries: Query[] = [],
    paths = options.paths ?? [learningPath()],
    rows = options.rows ?? [progress()];
  return {
    queries,
    context: {
      userId: uid,
      supabase: {
        from: (table: string) => {
          if (!["learning_paths", "learning_path_progress"].includes(table))
            throw new Error("Unexpected side effect: " + table);
          const q: Query = { table, actions: [] };
          queries.push(q);
          const b: Record<string, unknown> = {};
          for (const name of [
            "select",
            "eq",
            "in",
            "order",
            "range",
            "insert",
            "update",
            "upsert",
            "delete",
          ])
            b[name] = (...args: unknown[]) => {
              q.actions.push({ name, args });
              return b;
            };
          const result = () => {
            let data: unknown,
              count = 0;
            if (table === "learning_paths") {
              const id = action(q, "eq", "id")?.args[1],
                range = action(q, "range")?.args;
              data = id
                ? (paths.find((p) => p.id === id) ?? null)
                : range
                  ? paths.slice(Number(range[0]), Number(range[1]) + 1)
                  : paths;
              count = paths.length;
            } else {
              const pathId = action(q, "eq", "path_id")?.args[1],
                pathIds = action(q, "in", "path_id")?.args[1] as string[] | undefined;
              const found = rows.find((row) => row.user_id === uid && row.path_id === pathId);
              if (action(q, "insert")) data = action(q, "insert")!.args[0];
              else if (action(q, "update"))
                data =
                  found &&
                  found.id === action(q, "eq", "id")?.args[1] &&
                  found.updated_at === action(q, "eq", "updated_at")?.args[1]
                    ? { ...found, ...(action(q, "update")!.args[0] as object), updated_at: at }
                    : null;
              else if (pathId) data = found ?? null;
              else {
                const selected = rows.filter(
                  (row) => row.user_id === uid && pathIds?.includes(row.path_id),
                );
                data = selected;
                count = selected.length;
              }
            }
            return (
              options.override?.(q, { data, count, error: null }) ?? { data, count, error: null }
            );
          };
          for (const terminal of ["single", "maybeSingle"])
            b[terminal] = async () => {
              q.actions.push({ name: terminal, args: [] });
              return result();
            };
          b.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
            Promise.resolve(result()).then(resolve, reject);
          return b;
        },
      },
    },
  };
}
const run = (fn: unknown, f: ReturnType<typeof fixture>, data?: unknown) =>
  (fn as Handler)({ context: f.context, data });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(at));
});
afterEach(() => vi.useRealTimers());

describe("Learning authenticated read endpoints", () => {
  it.each([
    [listLearningPaths, { page: 1 }],
    [listMyProgress, { accountId: uid, pathIds: [pid] }],
  ] as const)("declares GET and Auth without a workspace role gate", async (fn, request) => {
    const f = fixture();
    await run(fn, f, request);
    expect((fn as unknown as Handler).method).toBe("GET");
    expect((fn as unknown as Handler).middlewareCount).toBe(1);
    expect(f.queries).toHaveLength(1);
    expect(writing(f.queries[0])).toBe(false);
  });
  it("paginates20 with exact count and stable difficulty/title/id order", async () => {
    const f = fixture();
    const value = await run(listLearningPaths, f, { page: 2 });
    expect(value).toMatchObject({ page: 2, pageSize: 20, total: 1, items: [], checkedAt: at });
    expect(f.queries[0].actions).toEqual([
      { name: "select", args: ["*", { count: "exact" }] },
      ...["difficulty", "title", "id"].map((column) => ({
        name: "order",
        args: [column, { ascending: true }],
      })),
      { name: "range", args: [20, 39] },
    ]);
  });
  it("reads only the caller's personal progress and explicitly requested paths", async () => {
    const f = fixture();
    expect(await run(listMyProgress, f, { accountId: uid, pathIds: [pid] })).toMatchObject({
      userId: uid,
      total: 1,
      items: [progress()],
    });
    expect(f.queries[0].actions).toEqual([
      { name: "select", args: ["*", { count: "exact" }] },
      { name: "eq", args: ["user_id", uid] },
      { name: "in", args: ["path_id", [pid]] },
      { name: "order", args: ["path_id", { ascending: true }] },
    ]);
  });
  it.for([null, undefined, { page: null }, [], { page: -1 }, { page: 1, workspaceId: otherPath }])(
    "rejects ambiguous catalog input before querying: %j",
    async (value) => {
      const f = fixture();
      await expect(run(listLearningPaths, f, value)).rejects.toThrow();
      expect(f.queries).toHaveLength(0);
    },
  );
  it.for([
    undefined,
    null,
    {},
    { accountId: uid, pathIds: [] },
    { accountId: uid, pathIds: [pid, pid] },
    { accountId: uid, pathIds: [pid], userId: otherUser },
  ])("requires a bounded progress scope before querying: %j", async (value) => {
    const f = fixture();
    await expect(run(listMyProgress, f, value)).rejects.toThrow();
    expect(f.queries).toHaveLength(0);
  });
  it.each([
    [listLearningPaths, { page: 1 }],
    [listMyProgress, { accountId: uid, pathIds: [pid] }],
  ] as const)("does not turn a database error into an empty result", async (fn, request) => {
    const f = fixture({
      override: (_, r) => ({ ...r, data: [], error: { message: "synthetic read error" } }),
    });
    await expect(run(fn, f, request)).rejects.toThrow("synthetic read error");
    expect(f.queries).toHaveLength(1);
  });
  it.for([null, undefined, {}, { partial: true }])(
    "rejects malformed catalog data: %j",
    async (data) => {
      const f = fixture({ override: (_, r) => ({ ...r, data }) });
      await expect(run(listLearningPaths, f, { page: 1 })).rejects.toThrow();
    },
  );
  it.for([null, undefined, 0, 2])(
    "requires an exact catalog count, not a fallback: %j",
    async (count) => {
      const f = fixture({ override: (_, r) => ({ ...r, count: count as never }) });
      await expect(run(listLearningPaths, f, { page: 1 })).rejects.toThrow();
    },
  );
  it.for([
    null,
    undefined,
    [progress({ user_id: otherUser })],
    [progress({ path_id: otherPath })],
    [progress(), progress()],
  ])("rejects invalid/foreign/duplicate progress batches: %j", async (data) => {
    const f = fixture({ override: (_, r) => ({ ...r, data }) });
    await expect(run(listMyProgress, f, { accountId: uid, pathIds: [pid] })).rejects.toThrow();
  });
  it("accepts explicitly confirmed empty catalog and progress independently", async () => {
    const f = fixture({ paths: [], rows: [] });
    expect(await run(listLearningPaths, f, {})).toMatchObject({ total: 0, items: [] });
    expect(await run(listMyProgress, f, { accountId: uid, pathIds: [pid] })).toMatchObject({
      total: 0,
      items: [],
    });
    expect(f.queries.every((q) => !writing(q))).toBe(true);
  });
});

describe.each([
  ["new endpoint", setMilestoneCompletion],
  ["strict legacy export", toggleMilestone],
] as const)("Learning %s", (_, fn) => {
  it("requires Auth and POST and rejects old blind-toggle input before any query", async () => {
    const f = fixture();
    expect((fn as unknown as Handler).method).toBe("POST");
    expect((fn as unknown as Handler).middlewareCount).toBe(1);
    await expect(run(fn, f, { pathId: pid, milestoneId: "first" })).rejects.toThrow();
    expect(f.queries).toHaveLength(0);
  });
  it("updates only the caller's exact personal version and confirms all returned fields", async () => {
    const f = fixture(),
      value = await run(fn, f, input());
    expect(value).toMatchObject({
      operationId,
      mode: "updated",
      recordedAt: at,
      progress: {
        ...progress(),
        completed_milestones: ["first", "legacy-original", "second"],
        progress_pct: 100,
        updated_at: at,
        completed_at: at,
      },
    });
    expect(f.queries).toHaveLength(3);
    const q = f.queries[2];
    expect(q.table).toBe("learning_path_progress");
    expect(action(q, "update")?.args[0]).toEqual({
      completed_milestones: ["first", "legacy-original", "second"],
      progress_pct: 100,
      completed_at: at,
    });
    expect(q.actions.filter((a) => a.name === "eq").map((a) => a.args)).toEqual([
      ["user_id", uid],
      ["path_id", pid],
      ["id", progress().id],
      ["updated_at", earlier],
    ]);
    expect(action(q, "single")).toBeDefined();
    expect(action(q, "select")?.args).toEqual(["*"]);
    expect(f.queries.some((query) => action(query, "upsert") || action(query, "delete"))).toBe(
      false,
    );
  });
  it("INSERTs on confirmed absence, with no inherited workspace or UPSERT", async () => {
    const f = fixture({ rows: [] }),
      request = input({ expectedProgress: null, milestoneId: "first" });
    expect(await run(fn, f, request)).toMatchObject({
      mode: "created",
      progress: {
        id: operationId,
        user_id: uid,
        path_id: pid,
        workspace_id: null,
        completed_milestones: ["first"],
        progress_pct: 50,
        started_at: at,
        updated_at: at,
        completed_at: null,
      },
    });
    expect(f.queries).toHaveLength(3);
    expect(action(f.queries[2], "insert")).toBeDefined();
    expect(action(f.queries[2], "update")).toBeUndefined();
  });
  it("unmarks explicitly, keeps unknown IDs and clears the completion date", async () => {
    const p = progress({
      completed_milestones: ["first", "legacy-original", "second"],
      progress_pct: 100,
      completed_at: earlier,
    });
    const f = fixture({ rows: [p] });
    expect(await run(fn, f, input({ expectedProgress: p, completed: false }))).toMatchObject({
      progress: {
        completed_milestones: ["first", "legacy-original"],
        progress_pct: 50,
        completed_at: null,
      },
    });
  });
  it.for([true, false])(
    "a no-op desired state (%s) reads but does not create/update/normalize",
    async (completed) => {
      const f = fixture({ rows: completed ? [progress()] : [] });
      const request = input({
        milestoneId: "first",
        completed,
        expectedProgress: completed ? progress() : null,
      });
      expect(await run(fn, f, request)).toMatchObject({
        mode: "unchanged",
        recordedAt: null,
        progress: completed ? progress() : null,
      });
      expect(f.queries).toHaveLength(2);
      expect(f.queries.some(writing)).toBe(false);
    },
  );
});

describe("Learning compare-and-set, strict reads and uncertain receipts", () => {
  it.for(["catalog", "progress", "write"])(
    "propagates %s errors and never retries or falls back to UPSERT",
    async (stage) => {
      const f = fixture({
        override: (q, r) =>
          (stage === "catalog" && q.table === "learning_paths") ||
          (stage === "progress" && q.table === "learning_path_progress" && !writing(q)) ||
          (stage === "write" && writing(q))
            ? { ...r, error: { message: `synthetic ${stage} failure` }, data: null }
            : r,
      });
      await expect(run(setMilestoneCompletion, f, input())).rejects.toThrow(
        `synthetic ${stage} failure`,
      );
      expect(f.queries).toHaveLength(stage === "catalog" ? 1 : stage === "progress" ? 2 : 3);
      expect(f.queries.filter(writing)).toHaveLength(stage === "write" ? 1 : 0);
    },
  );
  it.for([
    null,
    undefined,
    {},
    learningPath({
      milestones: [
        { id: "dupe", title: "A" },
        { id: "dupe", title: "B" },
      ],
    }),
  ])("does not write from an invalid/missing catalog: %j", async (data) => {
    const f = fixture({ override: (q, r) => (q.table === "learning_paths" ? { ...r, data } : r) });
    await expect(run(setMilestoneCompletion, f, input())).rejects.toThrow();
    expect(f.queries).toHaveLength(1);
  });
  it("checks catalog content before even reading the progress to be changed", async () => {
    const f = fixture({ paths: [learningPath({ title: "Edited catalog" })] });
    await expect(run(setMilestoneCompletion, f, input())).rejects.toThrow();
    expect(f.queries).toHaveLength(1);
  });
  it.for([
    [],
    [progress({ updated_at: at })],
    [progress({ progress_pct: 0 })],
    [progress({ completed_milestones: ["first", "new-client-id"] })],
    [progress({ id: operationId })],
  ])("denies a changed/missing complete expected row without a write", async (rows) => {
    const f = fixture({ rows });
    await expect(run(setMilestoneCompletion, f, input())).rejects.toThrow();
    expect(f.queries).toHaveLength(2);
  });
  it("does not overwrite concurrent creation after absence was observed", async () => {
    const f = fixture();
    await expect(
      run(setMilestoneCompletion, f, input({ expectedProgress: null })),
    ).rejects.toThrow();
    expect(f.queries).toHaveLength(2);
  });
  it("does not retry an INSERT unique-conflict race after pre-read", async () => {
    const f = fixture({
      rows: [],
      override: (q, r) =>
        action(q, "insert")
          ? { ...r, error: { code: "23505", message: "synthetic duplicate path" }, data: null }
          : r,
    });
    await expect(run(setMilestoneCompletion, f, input({ expectedProgress: null }))).rejects.toThrow(
      "synthetic duplicate path",
    );
    expect(f.queries.filter(writing)).toHaveLength(1);
  });
  it.for([undefined, {}, progress({ user_id: otherUser }), progress({ path_id: otherPath })])(
    "rejects a bad/foreign current progress read before writing: %j",
    async (data) => {
      const f = fixture({
        override: (q, r) =>
          q.table === "learning_path_progress" && !writing(q) ? { ...r, data } : r,
      });
      await expect(run(setMilestoneCompletion, f, input())).rejects.toThrow();
      expect(f.queries).toHaveLength(2);
    },
  );
  it.for([null, undefined, {}, [], { partial: true }])(
    "rejects zero-row/truncated mutation acknowledgement: %j",
    async (data) => {
      const f = fixture({ override: (q, r) => (writing(q) ? { ...r, data } : r) });
      await expect(run(setMilestoneCompletion, f, input())).rejects.toThrow();
      expect(f.queries.filter(writing)).toHaveLength(1);
    },
  );
  it.for([
    "user_id",
    "path_id",
    "progress_pct",
    "completed_milestones",
    "updated_at",
    "started_at",
    "workspace_id",
  ] as const)("rejects write receipt tampering of %s", async (field) => {
    const values = {
      user_id: otherUser,
      path_id: otherPath,
      progress_pct: 0,
      completed_milestones: ["first", "second"],
      updated_at: earlier,
      started_at: at,
      workspace_id: null,
    };
    const f = fixture({
      override: (q, r) =>
        writing(q) ? { ...r, data: { ...(r.data as object), [field]: values[field] } } : r,
    });
    await expect(run(setMilestoneCompletion, f, input())).rejects.toThrow();
    expect(f.queries.filter(writing)).toHaveLength(1);
  });
  it("retains all PostgreSQL fractional digits in the exact UPDATE predicate", async () => {
    const p = progress({ updated_at: "2026-11-12T14:00:00.1234567Z" }),
      f = fixture({ rows: [p] });
    await run(setMilestoneCompletion, f, input({ expectedProgress: p }));
    expect(action(f.queries[2], "eq", "updated_at")?.args).toEqual(["updated_at", p.updated_at]);
  });
  it("does not accept a timezone-equivalent unchanged returned version", async () => {
    const f = fixture({
      override: (q, r) =>
        writing(q)
          ? {
              ...r,
              data: { ...(r.data as object), updated_at: "2026-11-12T11:00:00.123456-03:00" },
            }
          : r,
    });
    await expect(run(setMilestoneCompletion, f, input())).rejects.toThrow();
  });
  it.for([
    {},
    { pathId: pid, milestoneId: "first" },
    { ...input(), expectedProgress: undefined },
    { ...input(), completed: 1 },
    { ...input(), workspaceId: otherPath },
    input({ expectedProgress: progress({ user_id: otherUser }) }),
    input({ operationId: "bad" }),
  ])("rejects ambiguous or foreign commands before querying: %j", async (request) => {
    const f = fixture();
    await expect(run(setMilestoneCompletion, f, request)).rejects.toThrow();
    expect(f.queries).toHaveLength(0);
  });
});

describe("Expected account checked on server before any DB access", () => {
  it("rejects a progress GET dispatched under a different Auth identity", async () => {
    const f = fixture();
    await expect(
      run(listMyProgress, f, { accountId: otherUser, pathIds: [pid] }),
    ).rejects.toThrow();
    expect(f.queries).toHaveLength(0);
  });
  it("rejects an old progress GET without an explicit expected account", async () => {
    const f = fixture();
    await expect(run(listMyProgress, f, { pathIds: [pid] })).rejects.toThrow();
    expect(f.queries).toHaveLength(0);
  });
  it.for([null, progress()])(
    "denies mismatched expected account for both creation and update",
    async (expectedProgress) => {
      const f = fixture();
      await expect(
        run(setMilestoneCompletion, f, input({ accountId: otherUser, expectedProgress })),
      ).rejects.toThrow();
      expect(f.queries).toHaveLength(0);
    },
  );
});
