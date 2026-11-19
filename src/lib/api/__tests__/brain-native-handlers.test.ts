import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

type Result = { data: unknown; count?: unknown; error: { message: string } | null };
type Query = { table: string; actions: Array<{ name: string; args: unknown[] }> };
type Handler = ((args: {
  data: unknown;
  context: { supabase: unknown; userId: string };
}) => Promise<unknown>) & { method: string; middlewareCount: number };
vi.mock("@tanstack/react-start", () => ({
  createServerFn: ({ method }: { method: string }) => {
    let parse = (value: unknown) => value;
    let middlewareCount = 0;
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
import {
  addMemory,
  listMemories,
  listRecommendations,
  runBrainRecommend,
  updateRecommendation,
} from "../brain.functions";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const id = "10000000-0000-4000-8000-000000000003";
const at = "2026-11-12T15:00:00Z";
const rec = {
  id,
  kind: "test",
  title: "Saved original",
  rationale: null,
  score: 0,
  status: "open",
  expires_at: null,
  created_at: at,
};
const memory = { id, kind: "goal", content: "My goal", created_at: at };
const action = (q: Query, name: string, column?: string) =>
  q.actions.find((a) => a.name === name && (column === undefined || a.args[0] === column));
const eq = (q: Query, column: string) => action(q, "eq", column)?.args[1];
function defaultResult(q: Query): Result {
  if (q.table === "workspace_members") return { data: { role: "owner" }, error: null };
  if (q.table === "brain_recommendations") {
    const insert = action(q, "insert");
    if (insert)
      return {
        data: (insert.args[0] as unknown[]).map((_, i) => ({
          id: `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        })),
        error: null,
      };
    if (action(q, "update"))
      return {
        data: { id, workspace_id: workspaceId, ...(action(q, "update")?.args[0] as object) },
        error: null,
      };
    return { data: [rec], count: 1, error: null };
  }
  if (q.table === "brain_memories")
    return action(q, "insert")
      ? { data: { ...memory, ...(action(q, "insert")?.args[0] as object) }, error: null }
      : { data: [memory], count: 1, error: null };
  if (q.table === "domain_events") return { data: { id }, error: null };
  return {
    data: null,
    count:
      q.table === "content"
        ? eq(q, "status") === "draft"
          ? 4
          : 12
        : q.table === "missions"
          ? 0
          : 1,
    error: null,
  };
}
function fixture(override: (q: Query, result: Result) => Result = (_, result) => result) {
  const queries: Query[] = [];
  const context = {
    userId,
    supabase: {
      from: (table: string) => {
        const query: Query = { table, actions: [] };
        queries.push(query);
        const builder: Record<string, unknown> = {};
        for (const name of [
          "select",
          "eq",
          "in",
          "order",
          "limit",
          "or",
          "insert",
          "update",
          "delete",
          "upsert",
        ])
          builder[name] = (...args: unknown[]) => {
            query.actions.push({ name, args });
            return builder;
          };
        const result = () => override(query, defaultResult(query));
        builder.single = async () => {
          query.actions.push({ name: "single", args: [] });
          return result();
        };
        builder.maybeSingle = async () => {
          query.actions.push({ name: "maybeSingle", args: [] });
          return result();
        };
        builder.then = (
          resolve: (value: Result) => unknown,
          reject: (reason: unknown) => unknown,
        ) => Promise.resolve().then(result).then(resolve, reject);
        return builder;
      },
    },
  };
  return { context, queries };
}
const reads = [
  ["recommendations", listRecommendations],
  ["memories", listMemories],
] as const;
const writes = [
  ["generate", runBrainRecommend, { workspaceId }],
  ["memory", addMemory, { workspaceId, kind: "goal", content: "  My goal  " }],
  ["status", updateRecommendation, { workspaceId, id, status: "applied" }],
] as const;
function run(fn: unknown, f: ReturnType<typeof fixture>, data: unknown = { workspaceId }) {
  return (fn as Handler)({ data, context: f.context });
}
const hasWrite = (q: Query) =>
  q.actions.some((a) => ["insert", "update", "delete", "upsert"].includes(a.name));

describe.each(reads)("native %s GET", (_, fn) => {
  it.each(["owner", "admin", "editor", "viewer"])(
    "checks %s membership before reads; never writes",
    async (role) => {
      const f = fixture((q, r) => (q.table === "workspace_members" ? { ...r, data: { role } } : r));
      const result = await run(fn, f);
      expect((fn as unknown as Handler).method).toBe("GET");
      expect((fn as unknown as Handler).middlewareCount).toBe(1);
      expect(result).toMatchObject({ total: 1, limit: 50 });
      expect(f.queries[0].table).toBe("workspace_members");
      expect(eq(f.queries[0], "workspace_id")).toBe(workspaceId);
      expect(eq(f.queries[0], "user_id")).toBe(userId);
      expect(f.queries.some(hasWrite)).toBe(false);
      const query = f.queries[1];
      expect(eq(query, "workspace_id")).toBe(workspaceId);
      expect(action(query, "select")?.args[1]).toEqual({ count: "exact" });
      expect(query.actions.filter((a) => a.name === "order").map((a) => a.args)).toEqual([
        ["created_at", { ascending: false }],
        ["id", { ascending: false }],
      ]);
      expect(action(query, "limit")?.args).toEqual([50]);
    },
  );
  it.each([null, { role: "unknown" }])(
    "fails closed without a recognized membership: %#",
    async (data) => {
      const f = fixture((q, r) => (q.table === "workspace_members" ? { ...r, data } : r));
      await expect(run(fn, f)).rejects.toThrow();
      expect(f.queries).toHaveLength(1);
    },
  );
  it("propagates membership errors instead of reading cached access", async () => {
    const f = fixture((q, r) =>
      q.table === "workspace_members" ? { ...r, error: { message: "membership failure" } } : r,
    );
    await expect(run(fn, f)).rejects.toThrow();
    expect(f.queries).toHaveLength(1);
  });
  it.each([
    { data: null, count: 0, error: null },
    { data: [], count: null, error: null },
    { data: [], count: 1, error: null },
    { data: [], count: 0, error: { message: "read failed" } },
  ])("does not call an invalid or failed reading empty: %#", async (patch) => {
    const f = fixture((q, r) => (q.table === "workspace_members" ? r : patch));
    await expect(run(fn, f)).rejects.toThrow();
  });
  it("accepts a confirmed zero and separately exposes exact totals above the preview limit", async () => {
    const empty = fixture((q, r) =>
      q.table === "workspace_members" ? r : { data: [], count: 0, error: null },
    );
    expect(await run(fn, empty)).toMatchObject({ items: [], total: 0 });
    const item = fn === listRecommendations ? rec : memory;
    const f = fixture((q, r) =>
      q.table === "workspace_members"
        ? r
        : { data: Array.from({ length: 50 }, () => item), count: 1205, error: null },
    );
    expect(await run(fn, f)).toMatchObject({
      total: 1205,
      items: Array.from({ length: 50 }, () => item),
    });
  });
});

describe.each(writes)("native %s POST", (_, fn, data) => {
  it.each(["owner", "admin", "editor"])(
    "accepts %s, scopes every query and confirms output",
    async (role) => {
      const f = fixture((q, r) => (q.table === "workspace_members" ? { ...r, data: { role } } : r));
      await run(fn, f, data);
      expect((fn as unknown as Handler).method).toBe("POST");
      expect((fn as unknown as Handler).middlewareCount).toBe(1);
      expect(f.queries[0].table).toBe("workspace_members");
      for (const query of f.queries.slice(1)) {
        const insert = action(query, "insert")?.args[0];
        if (Array.isArray(insert))
          expect(insert.every((row) => row.workspace_id === workspaceId)).toBe(true);
        else if (insert) expect(insert).toMatchObject({ workspace_id: workspaceId });
        else expect(eq(query, "workspace_id")).toBe(workspaceId);
      }
    },
  );
  it.each([null, { role: "viewer" }, { role: "unknown" }])(
    "rejects absent/viewer/unknown membership before any other query: %#",
    async (member) => {
      const f = fixture((q, r) => (q.table === "workspace_members" ? { ...r, data: member } : r));
      await expect(run(fn, f, data)).rejects.toThrow();
      expect(f.queries).toHaveLength(1);
    },
  );
  it("propagates failed membership and rejects an invalid workspace UUID", async () => {
    const f = fixture((q, r) =>
      q.table === "workspace_members" ? { ...r, error: { message: "membership failure" } } : r,
    );
    await expect(run(fn, f, data)).rejects.toThrow();
    expect(f.queries).toHaveLength(1);
    const invalid = fixture();
    await expect(run(fn, invalid, { ...data, workspaceId: "bad" })).rejects.toThrow();
    expect(invalid.queries).toHaveLength(0);
  });
});

describe("native generation confirmation", () => {
  it("uses exact HEAD counts, connected status and both active mission states", async () => {
    const f = fixture();
    const result = await run(runBrainRecommend, f);
    expect(result).toEqual({ generated: 2, eventRecorded: true });
    for (const q of f.queries.filter((q) =>
      ["brands", "channels", "content", "missions"].includes(q.table),
    ))
      expect(action(q, "select")?.args[1]).toEqual({ count: "exact", head: true });
    expect(
      eq(
        f.queries.find((q) => q.table === "channels")!,
        "status",
      ),
    ).toBe("connected");
    expect(
      action(
        f.queries.find((q) => q.table === "missions")!,
        "in",
      )?.args,
    ).toEqual(["status", ["pending", "in_progress"]]);
  });
  it.each(["brands", "channels", "content", "missions"])(
    "does not write after failed %s count",
    async (table) => {
      const f = fixture((q, r) =>
        q.table === table ? { ...r, error: { message: "source unavailable" } } : r,
      );
      await expect(run(runBrainRecommend, f)).rejects.toThrow();
      expect(f.queries.some(hasWrite)).toBe(false);
    },
  );
  it.each([null, -1, 1.5, "0"])(
    "does not generate from malformed source count: %#",
    async (count) => {
      const f = fixture((q, r) => (q.table === "brands" ? { ...r, count } : r));
      await expect(run(runBrainRecommend, f)).rejects.toThrow();
      expect(f.queries.some(hasWrite)).toBe(false);
    },
  );
  it.each(["pt-BR", "en-US"])(
    "persists one append-only batch in %s, without expiring history",
    async (language) => {
      const f = fixture();
      await run(runBrainRecommend, f, { workspaceId, language });
      const write = f.queries.find((q) => q.table === "brain_recommendations" && hasWrite(q))!;
      const rows = action(write, "insert")!.args[0] as Array<{ title: string; status: string }>;
      expect(rows[0].title).toMatch(language === "pt-BR" ? /Revise/ : /Review/);
      expect(rows.every((row) => row.status === "open")).toBe(true);
      expect(
        f.queries
          .flatMap((q) => q.actions)
          .some((a) => ["delete", "update", "upsert"].includes(a.name)),
      ).toBe(false);
    },
  );
  it("does not write or claim an event when no rule matches", async () => {
    const f = fixture((q, r) =>
      q.table === "content" && eq(q, "status") === "draft"
        ? { ...r, count: 2 }
        : q.table === "missions"
          ? { ...r, count: 1 }
          : r,
    );
    expect(await run(runBrainRecommend, f)).toEqual({ generated: 0, eventRecorded: false });
    expect(f.queries.some(hasWrite)).toBe(false);
  });
  it.each([
    { data: null, error: { message: "insert failed" } },
    { data: [], error: null },
    { data: [{ id }], error: null },
    { data: [{ id }, { id }], error: null },
  ])("never claims an unconfirmed batch succeeded or writes its event: %#", async (result) => {
    const f = fixture((q, r) =>
      q.table === "brain_recommendations" && action(q, "insert") ? result : r,
    );
    await expect(run(runBrainRecommend, f)).rejects.toThrow();
    expect(f.queries.some((q) => q.table === "domain_events")).toBe(false);
    expect(
      f.queries.flatMap((q) => q.actions).some((a) => ["update", "delete"].includes(a.name)),
    ).toBe(false);
  });
  it.each(["error", "throw", "no-row"])(
    "keeps a confirmed main insert as partial success on secondary event %s",
    async (failure) => {
      const f = fixture((q, r) => {
        if (q.table !== "domain_events") return r;
        if (failure === "throw") throw new Error("event transport failed");
        return {
          data: null,
          error: failure === "error" ? { message: "event insert failed" } : null,
        };
      });
      expect(await run(runBrainRecommend, f)).toEqual({ generated: 2, eventRecorded: false });
    },
  );
});

describe("native mutation acknowledgements", () => {
  it("trims memory input before persisting and acknowledges the returned row", async () => {
    const f = fixture();
    expect(await run(addMemory, f, writes[1][2])).toMatchObject({
      content: "My goal",
      kind: "goal",
    });
    expect(action(f.queries[1], "insert")?.args[0]).toEqual({
      workspace_id: workspaceId,
      kind: "goal",
      content: "My goal",
    });
  });
  it.each([" ", "x", "x".repeat(4001)])(
    "rejects invalid trimmed memory before a DB request: %#",
    async (content) => {
      const f = fixture();
      await expect(run(addMemory, f, { ...writes[1][2], content })).rejects.toThrow();
      expect(f.queries).toHaveLength(0);
    },
  );
  it.each([null, { ...memory, content: "different" }, { ...memory, kind: "fact" }])(
    "does not confirm missing/mismatched memory receipt: %#",
    async (data) => {
      const f = fixture((q, r) => (q.table === "brain_memories" ? { ...r, data } : r));
      await expect(run(addMemory, f, writes[1][2])).rejects.toThrow();
    },
  );
  it("only transitions the requested workspace's open, non-expired record", async () => {
    const f = fixture();
    expect(await run(updateRecommendation, f, writes[2][2])).toEqual({
      id,
      workspace_id: workspaceId,
      status: "applied",
    });
    const query = f.queries[1];
    expect(eq(query, "id")).toBe(id);
    expect(eq(query, "status")).toBe("open");
    expect(action(query, "or")?.args[0]).toMatch(/^expires_at.is.null,expires_at.gt.\d{4}-/);
    expect(action(query, "single")).toBeDefined();
  });
  it.each([
    null,
    { id, workspace_id: workspaceId, status: "dismissed" },
    { id: userId, workspace_id: workspaceId, status: "applied" },
    { id, workspace_id: userId, status: "applied" },
  ])("does not confirm zero/wrong status rows: %#", async (data) => {
    const f = fixture((q, r) => (q.table === "brain_recommendations" ? { ...r, data } : r));
    await expect(run(updateRecommendation, f, writes[2][2])).rejects.toThrow();
  });
  it.each(["open", "expired", "other"])("rejects unsupported manual target %s", async (status) => {
    const f = fixture();
    await expect(run(updateRecommendation, f, { ...writes[2][2], status })).rejects.toThrow();
    expect(f.queries).toHaveLength(0);
  });
  it("does not import gateway/core orchestration into this rules-only API", () => {
    const source = readFileSync(new URL("../brain.functions.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(
      /callAITool|runAIInsights|brainSnapshot|brainAskAll|service_role|\.delete\(/,
    );
  });
});
