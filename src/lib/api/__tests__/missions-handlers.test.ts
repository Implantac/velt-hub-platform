import { describe, expect, it, vi } from "vitest";
import { MISSION_STATUSES } from "@/lib/missions/contracts";
import { at, later, mission, userId, workspaceId } from "@/lib/missions/__tests__/fixtures";

type Result = {
  data: unknown;
  count?: number | null;
  error: { message: string; code?: string } | null;
};
type Query = { table: string; actions: Array<{ name: string; args: unknown[] }> };
type Handler = ((args: {
  data: unknown;
  context: { supabase: unknown; userId: string };
}) => Promise<unknown>) & { method: string; middlewareCount: number };

// Handler contracts under a synthetic authenticated context. These tests do
// not execute Auth middleware, Postgres, RLS or an external service.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: ({ method }: { method: string }) => {
    let parse = (value: unknown) => value;
    let middlewareCount = 0;
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
import { createMission, listMissions, updateMissionStatus } from "../missions.functions";

const action = (q: Query, name: string, column?: string) =>
  q.actions.find((a) => a.name === name && (column === undefined || a.args[0] === column));
const eq = (q: Query, column: string) => action(q, "eq", column)?.args[1];
const writes = (q: Query) =>
  q.actions.some((a) => ["insert", "update", "delete", "upsert"].includes(a.name));
function defaultResult(query: Query): Result {
  if (query.table === "workspace_members") return { data: { role: "owner" }, error: null };
  if (query.table === "domain_events") return { data: { id: mission(999).id }, error: null };
  const inserted = action(query, "insert");
  if (inserted) return { data: { ...mission(), ...(inserted.args[0] as object) }, error: null };
  const updated = action(query, "update");
  if (updated)
    return {
      data: { ...mission(), updated_at: later, ...(updated.args[0] as object) },
      error: null,
    };
  return {
    data: [mission(0, { status: (eq(query, "status") ?? "pending") as "pending" })],
    count: 1,
    error: null,
  };
}
function fixture(override: (query: Query, result: Result) => Result = (_, result) => result) {
  const queries: Query[] = [];
  return {
    queries,
    context: {
      userId,
      supabase: {
        from: (table: string) => {
          const query: Query = { table, actions: [] };
          queries.push(query);
          const builder: Record<string, unknown> = {};
          for (const name of [
            "select",
            "eq",
            "order",
            "range",
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
    },
  };
}
const createInput = { workspaceId, title: "  Saved goal  ", description: " Notes ", priority: 4 };
const statusInput = {
  workspaceId,
  id: mission().id,
  status: "done" as const,
  expectedStatus: "pending" as const,
  expectedUpdatedAt: at,
};
const mutations = [
  ["create", createMission, createInput],
  ["status", updateMissionStatus, statusInput],
] as const;
const run = (fn: unknown, f: ReturnType<typeof fixture>, data: unknown = { workspaceId }) =>
  (fn as Handler)({ data, context: f.context });

describe("mission page GET", () => {
  it.each(["owner", "admin", "editor", "viewer"])(
    "checks %s membership and scopes all reads before returning data",
    async (role) => {
      const f = fixture((q, r) => (q.table === "workspace_members" ? { ...r, data: { role } } : r));
      expect(await run(listMissions, f)).toMatchObject({
        total: 1,
        page: 1,
        pageSize: 20,
        status: "all",
        workspaceId,
      });
      expect((listMissions as unknown as Handler).method).toBe("GET");
      expect((listMissions as unknown as Handler).middlewareCount).toBe(1);
      expect(f.queries[0].table).toBe("workspace_members");
      expect(eq(f.queries[0], "workspace_id")).toBe(workspaceId);
      expect(eq(f.queries[0], "user_id")).toBe(userId);
      const query = f.queries[1];
      expect(eq(query, "workspace_id")).toBe(workspaceId);
      expect(action(query, "select")?.args[1]).toEqual({ count: "exact" });
      expect(action(query, "range")?.args).toEqual([0, 19]);
      expect(query.actions.filter((a) => a.name === "order").map((a) => a.args)).toEqual([
        ["priority", { ascending: false }],
        ["created_at", { ascending: false }],
        ["id", { ascending: false }],
      ]);
      expect(eq(query, "status")).toBeUndefined();
      expect(f.queries.some(writes)).toBe(false);
    },
  );
  it.each([null, { role: "unknown" }, { role: "service_role" }])(
    "refuses missing or unknown membership: %#",
    async (member) => {
      const f = fixture((q, r) => (q.table === "workspace_members" ? { ...r, data: member } : r));
      await expect(run(listMissions, f)).rejects.toThrow();
      expect(f.queries).toHaveLength(1);
    },
  );
  it("propagates membership read failure without querying missions", async () => {
    const f = fixture((q, r) =>
      q.table === "workspace_members" ? { ...r, error: { message: "membership unavailable" } } : r,
    );
    await expect(run(listMissions, f)).rejects.toThrow("membership unavailable");
    expect(f.queries).toHaveLength(1);
  });
  it.each(MISSION_STATUSES)(
    "applies the same %s filter to page and exact total",
    async (status) => {
      const f = fixture();
      expect(await run(listMissions, f, { workspaceId, status, page: 1 })).toMatchObject({
        status,
        total: 1,
      });
      expect(eq(f.queries[1], "status")).toBe(status);
      expect(action(f.queries[1], "select")?.args[1]).toEqual({ count: "exact" });
    },
  );
  it("requests a bounded later page and keeps totals above the REST default row cap", async () => {
    const f = fixture((q, r) =>
      q.table === "missions"
        ? { data: Array.from({ length: 20 }, (_, i) => mission(40 + i)), count: 1205, error: null }
        : r,
    );
    const value = await run(listMissions, f, { workspaceId, page: 3 });
    expect(value).toMatchObject({ total: 1205, page: 3 });
    expect(action(f.queries[1], "range")?.args).toEqual([40, 59]);
  });
  it("allows a confirmed empty first page and an explicitly out-of-range page", async () => {
    const empty = fixture((q, r) =>
      q.table === "missions" ? { data: [], count: 0, error: null } : r,
    );
    expect(await run(listMissions, empty)).toMatchObject({ items: [], total: 0 });
    const out = fixture((q, r) =>
      q.table === "missions" ? { data: [], count: 1, error: null } : r,
    );
    expect(await run(listMissions, out, { workspaceId, page: 2 })).toMatchObject({
      items: [],
      total: 1,
      page: 2,
    });
  });
  it.each([
    { data: null, count: 0, error: null },
    { data: [], count: null, error: null },
    { data: [], count: 1, error: null },
    { data: [mission()], count: -1, error: null },
    { data: [mission(0, { workspace_id: userId })], count: 1, error: null },
    { data: [mission(0, { status: "done" })], count: 1, error: null },
    { data: [], count: 0, error: { message: "read unavailable" } },
  ])("does not turn corrupt or failed read into empty success: %#", async (result) => {
    const f = fixture((q, r) => (q.table === "missions" ? result : r));
    await expect(run(listMissions, f, { workspaceId, status: "pending" })).rejects.toThrow();
    expect(f.queries.some(writes)).toBe(false);
  });
  it.each([0, 1, 20])(
    "confirms a vanished later page after PGRST103 using an exact filtered count of %s",
    async (total) => {
      const f = fixture((q, r) =>
        q.table !== "missions"
          ? r
          : action(q, "range")
            ? {
                data: null,
                count: null,
                error: { code: "PGRST103", message: "range beyond count" },
              }
            : { data: null, count: total, error: null },
      );
      expect(await run(listMissions, f, { workspaceId, status: "done", page: 2 })).toMatchObject({
        items: [],
        total,
        page: 2,
        status: "done",
      });
      expect(f.queries).toHaveLength(3);
      expect(action(f.queries[2], "select")?.args).toEqual(["id", { count: "exact", head: true }]);
      expect(eq(f.queries[2], "workspace_id")).toBe(workspaceId);
      expect(eq(f.queries[2], "status")).toBe("done");
      expect(f.queries.some(writes)).toBe(false);
    },
  );
  it.each([null, -1, 21])(
    "does not hide PGRST103 when the fallback count does not prove an absent page: %#",
    async (total) => {
      const f = fixture((q, r) =>
        q.table !== "missions"
          ? r
          : action(q, "range")
            ? { data: null, count: null, error: { code: "PGRST103", message: "range invalid" } }
            : { data: null, count: total, error: null },
      );
      await expect(run(listMissions, f, { workspaceId, page: 2 })).rejects.toThrow();
    },
  );
  it("does not hide a failed fallback count or turn first-page errors into confirmed empty data", async () => {
    const f = fixture((q, r) =>
      q.table !== "missions"
        ? r
        : action(q, "range")
          ? { data: null, error: { code: "PGRST103", message: "range invalid" } }
          : { data: null, count: 0, error: { message: "count unavailable" } },
    );
    await expect(run(listMissions, f, { workspaceId, page: 2 })).rejects.toThrow(
      "count unavailable",
    );
    const first = fixture((q, r) =>
      q.table === "missions"
        ? { data: null, error: { code: "PGRST103", message: "bad range" } }
        : r,
    );
    await expect(run(listMissions, first)).rejects.toThrow("bad range");
    expect(first.queries).toHaveLength(2);
  });
  it.each([
    { workspaceId: "invalid" },
    { workspaceId, page: 0 },
    { workspaceId, page: 100001 },
    { workspaceId, status: "invalid" },
  ])("rejects invalid input before any database query: %#", async (input) => {
    const f = fixture();
    await expect(run(listMissions, f, input)).rejects.toThrow();
    expect(f.queries).toHaveLength(0);
  });
});

describe.each(mutations)("mission %s POST", (_, fn, input) => {
  it.each(["owner", "admin", "editor"])("accepts %s only after role validation", async (role) => {
    const f = fixture((q, r) => (q.table === "workspace_members" ? { ...r, data: { role } } : r));
    await run(fn, f, input);
    expect((fn as unknown as Handler).method).toBe("POST");
    expect((fn as unknown as Handler).middlewareCount).toBe(1);
    expect(f.queries[0].table).toBe("workspace_members");
    expect(eq(f.queries[0], "workspace_id")).toBe(workspaceId);
    expect(eq(f.queries[0], "user_id")).toBe(userId);
    for (const query of f.queries.slice(1)) {
      const inserted = action(query, "insert")?.args[0];
      if (inserted) expect(inserted).toMatchObject({ workspace_id: workspaceId });
      else expect(eq(query, "workspace_id")).toBe(workspaceId);
    }
  });
  it.each([null, { role: "viewer" }, { role: "unknown" }])(
    "denies absent/viewer/unknown before writes: %#",
    async (member) => {
      const f = fixture((q, r) => (q.table === "workspace_members" ? { ...r, data: member } : r));
      await expect(run(fn, f, input)).rejects.toThrow();
      expect(f.queries).toHaveLength(1);
    },
  );
  it("propagates membership failure and rejects invalid scope before issuing a write", async () => {
    const f = fixture((q, r) =>
      q.table === "workspace_members" ? { ...r, error: { message: "membership failure" } } : r,
    );
    await expect(run(fn, f, input)).rejects.toThrow();
    expect(f.queries).toHaveLength(1);
    const invalid = fixture();
    await expect(run(fn, invalid, { ...input, workspaceId: "invalid" })).rejects.toThrow();
    expect(invalid.queries).toHaveLength(0);
  });
});

describe("mission creation confirmation", () => {
  it("persists normalized fields with explicit pending state and authenticated creator", async () => {
    const f = fixture();
    expect(await run(createMission, f, createInput)).toMatchObject({
      mission: {
        title: "Saved goal",
        description: "Notes",
        priority: 4,
        status: "pending",
        created_by: userId,
      },
      eventRecorded: true,
    });
    const query = f.queries[1];
    expect(action(query, "insert")?.args[0]).toEqual({
      workspace_id: workspaceId,
      title: "Saved goal",
      description: "Notes",
      priority: 4,
      status: "pending",
      created_by: userId,
    });
    expect(action(query, "single")).toBeDefined();
    expect(action(f.queries[2], "insert")?.args[0]).toMatchObject({
      workspace_id: workspaceId,
      event_type: "MissionAssigned",
      payload: { mission_id: mission().id, title: "Saved goal" },
    });
  });
  it("preserves priority zero and normalizes an omitted/blank description to null", async () => {
    const f = fixture();
    expect(
      await run(createMission, f, { workspaceId, title: " My goal ", description: "  " }),
    ).toMatchObject({ mission: { title: "My goal", description: null, priority: 0 } });
  });
  it.each([
    { data: null, error: null },
    { data: { ok: true }, error: null },
    { data: mission(), error: null },
    { data: null, error: { message: "insert unavailable" } },
  ])("never acknowledges a missing or incompatible primary receipt: %#", async (result) => {
    const f = fixture((q, r) => (q.table === "missions" ? result : r));
    await expect(run(createMission, f, createInput)).rejects.toThrow();
    expect(f.queries.some((q) => q.table === "domain_events")).toBe(false);
    expect(f.queries.filter((q) => q.table === "missions" && action(q, "insert"))).toHaveLength(1);
  });
  it.each([
    { data: null, error: null },
    { data: { id: "invalid" }, error: null },
    { data: { id: mission().id }, error: { message: "event unavailable" } },
  ])("keeps a confirmed create when the secondary event is missing: %#", async (result) => {
    const f = fixture((q, r) => (q.table === "domain_events" ? result : r));
    expect(await run(createMission, f, createInput)).toMatchObject({
      eventRecorded: false,
      mission: { title: "Saved goal" },
    });
    expect(f.queries.filter((q) => q.table === "missions")).toHaveLength(1);
  });
  it("keeps confirmed primary success even when recording the event throws", async () => {
    const f = fixture((q, r) => {
      if (q.table === "domain_events") throw new Error("transport unavailable");
      return r;
    });
    expect(await run(createMission, f, createInput)).toMatchObject({ eventRecorded: false });
    expect(f.queries.filter((q) => q.table === "missions")).toHaveLength(1);
  });
  it.each([" ", "x", "x".repeat(161)])(
    "does not create or emit an event for invalid normalized title: %#",
    async (title) => {
      const f = fixture();
      await expect(run(createMission, f, { ...createInput, title })).rejects.toThrow();
      expect(f.queries).toHaveLength(0);
    },
  );
});

describe("manual mission status concurrency", () => {
  it("conditions the update on workspace, ID, expected status and full observed timestamp", async () => {
    const f = fixture();
    expect(await run(updateMissionStatus, f, statusInput)).toMatchObject({
      id: mission().id,
      workspace_id: workspaceId,
      status: "done",
      updated_at: later,
    });
    const query = f.queries[1];
    expect(eq(query, "workspace_id")).toBe(workspaceId);
    expect(eq(query, "id")).toBe(mission().id);
    expect(eq(query, "status")).toBe("pending");
    expect(eq(query, "updated_at")).toBe(at);
    expect(action(query, "update")?.args[0]).toEqual({ status: "done" });
    expect(action(query, "single")).toBeDefined();
    expect(f.queries).toHaveLength(2);
  });
  it.each(MISSION_STATUSES)(
    "allows an explicit manual transition into %s, including recovery from dismissed",
    async (status) => {
      const f = fixture();
      const input = {
        ...statusInput,
        status,
        expectedStatus: status === "pending" ? "dismissed" : "pending",
      };
      expect(await run(updateMissionStatus, f, input)).toMatchObject({ status });
    },
  );
  it.each([
    { data: null, error: null },
    { data: [], error: null },
    { data: { ok: true }, error: null },
    { data: mission(0, { status: "pending" }), error: null },
    { data: mission(1, { status: "done" }), error: null },
    { data: mission(0, { status: "done", workspace_id: userId }), error: null },
    { data: null, error: { message: "zero rows: concurrent change", code: "PGRST116" } },
  ])("never calls a zero-row/conflicting/wrong-scope update successful: %#", async (result) => {
    const f = fixture((q, r) => (q.table === "missions" ? result : r));
    await expect(run(updateMissionStatus, f, statusInput)).rejects.toThrow();
    expect(f.queries.filter((q) => action(q, "update"))).toHaveLength(1);
    expect(
      f.queries.some((q) => action(q, "insert") || action(q, "delete") || action(q, "upsert")),
    ).toBe(false);
  });
  it.each([
    { expectedUpdatedAt: undefined },
    { expectedUpdatedAt: "bad" },
    { status: "pending" },
    { expectedStatus: undefined },
  ])("requires a real observed version and different final state: %#", async (patch) => {
    const f = fixture();
    await expect(run(updateMissionStatus, f, { ...statusInput, ...patch })).rejects.toThrow();
    expect(f.queries).toHaveLength(0);
  });
});
