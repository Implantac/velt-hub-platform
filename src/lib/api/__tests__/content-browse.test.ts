import { describe, expect, it, vi } from "vitest";
import type { ContentPage } from "@/lib/content/browse";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse = (x: unknown) => x;
    const b = {
      middleware: () => b,
      inputValidator: (p: typeof parse) => {
        parse = p;
        return b;
      },
      handler: (h: (x: unknown) => unknown) => (a: { data: unknown; context: unknown }) =>
        h({ ...a, data: parse(a.data) }),
    };
    return b;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { getContentPage } from "../content.functions";
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ws = uuid(1),
  user = uuid(2),
  at = "2026-11-12T12:00:00.123456+00:00";
const row = (n: number, status = "draft") => ({
  id: uuid(n),
  workspace_id: ws,
  created_at: at,
  updated_at: at,
  title: `unit ${n}`,
  body: "text",
  media: [],
  metadata: {},
  type: "post",
  status,
  brand: null,
});
const rows = Array.from({ length: 21 }, (_, i) => row(100 - i));
type Call = { table: string; action: string; args: unknown[] };
function fixture(
  o: {
    role?: string | null;
    rows?: unknown[] | null;
    counts?: Record<string, number>;
    matchingCounts?: Record<string, number>;
    jobs?: { id: string; content_id: string }[] | null;
    fail?: string;
    noCount?: boolean;
  } = {},
) {
  const calls: Call[] = [];
  const counts = o.counts ?? {
    all: 83,
    draft: 80,
    archived: 3,
    scheduled: 0,
    publishing: 0,
    published: 0,
    failed: 0,
  };
  const context = {
    userId: user,
    supabase: {
      from: (table: string) => {
        calls.push({ table, action: "from", args: [] });
        let head = false,
          status = "all",
          search = false,
          first = 0,
          last = 499;
        const q: Record<string, unknown> = {};
        for (const action of ["select", "eq", "or", "filter", "in", "order", "limit", "range"]) {
          q[action] = (...args: unknown[]) => {
            calls.push({ table, action, args });
            if (action === "select") head = !!(args[1] as { head?: boolean } | undefined)?.head;
            if (action === "eq" && args[0] === "status") status = String(args[1]);
            if (action === "filter") search = true;
            if (action === "range") {
              first = Number(args[0]);
              last = Number(args[1]);
            }
            return q;
          };
        }
        const result = () => {
          const fail =
            o.fail === table ||
            (o.fail === "rows" && table === "content" && !head) ||
            (o.fail === "counts" && table === "content" && head);
          if (fail) return { data: null, count: null, error: { message: "read unavailable" } };
          if (table === "workspace_members")
            return { data: o.role === null ? null : { role: o.role ?? "owner" }, error: null };
          if (table === "scheduler_jobs")
            return {
              data: o.jobs === null ? null : (o.jobs ?? []).slice(first, last + 1),
              error: null,
            };
          if (table === "content" && head)
            return {
              data: null,
              error: null,
              count: o.noCount
                ? null
                : search
                  ? (o.matchingCounts ?? counts)[status]
                  : counts[status],
            };
          if (table === "content")
            return { data: o.rows === undefined ? rows : o.rows, error: null };
          throw new Error("Unexpected table");
        };
        q.maybeSingle = async () => result();
        q.then = (resolve: (r: unknown) => unknown) => Promise.resolve(result()).then(resolve);
        return q;
      },
    },
  };
  return { context, calls };
}
type Handler = (a: { data: unknown; context: unknown }) => Promise<ContentPage>;
const run = async (f: ReturnType<typeof fixture>, patch: Record<string, unknown> = {}) =>
  (getContentPage as unknown as Handler)({
    data: { workspaceId: ws, ...patch },
    context: f.context,
  });
describe("real-product content browse read handler (pre-authenticated unit contexts)", () => {
  it.each(["owner", "admin", "editor", "viewer"])(
    "allows a %s read with no mutation/provider call",
    async (role) => {
      const f = fixture({ role }),
        r = await run(f);
      expect(r.items).toHaveLength(20);
      expect(r.counts.all).toBe(83);
      expect(r.workspaceTotal).toBe(83);
      expect(r.nextCursor).toEqual({ createdAt: at, id: uuid(81) });
      expect(f.calls.every((c) => !["insert", "update", "delete", "rpc"].includes(c.action))).toBe(
        true,
      );
    },
  );
  it("rejects a nonmember before reading the library", async () => {
    const f = fixture({ role: null });
    await expect(run(f)).rejects.toThrow("forbidden");
    expect(f.calls.filter((c) => c.action === "from").map((c) => c.table)).toEqual([
      "workspace_members",
    ]);
  });
  it.each(["workspace_members", "rows", "counts", "scheduler_jobs"])(
    "never converts %s errors to available rows or zero counters",
    async (fail) => {
      await expect(run(fixture({ fail }))).rejects.toThrow("read unavailable");
    },
  );
  it("requires returned rows and exact available counts", async () => {
    await expect(run(fixture({ rows: null }))).rejects.toThrow("Content rows unavailable");
    await expect(run(fixture({ noCount: true }))).rejects.toThrow("Content count unavailable");
  });
  it("keeps the filtered count separate from the total workspace", async () => {
    const matchingCounts = {
      all: 3,
      draft: 2,
      archived: 1,
      scheduled: 0,
      publishing: 0,
      published: 0,
      failed: 0,
    };
    const result = await run(fixture({ rows: [row(10)], matchingCounts }), { search: "unit" });
    expect(result.counts).toEqual(matchingCounts);
    expect(result.workspaceTotal).toBe(83);
  });
  it("refuses an unavailable lock result rather than enabling the rows", async () => {
    await expect(run(fixture({ jobs: null }))).rejects.toThrow("A consulta não retornou");
  });
  it.each(["scheduled", "publishing"])("always protects a %s lifecycle row", async (status) => {
    const result = await run(fixture({ rows: [row(10, status)] }), { status });
    expect(result.items[0].deliveryLocked).toBe(true);
  });
  it("scopes every content/job query to the requested workspace and orders a composite cursor", async () => {
    const f = fixture();
    await run(f);
    const contentQueries = f.calls.filter(
      (c) => c.table === "content" && c.action === "from",
    ).length;
    expect(
      f.calls.filter(
        (c) => c.table === "content" && c.action === "eq" && c.args[0] === "workspace_id",
      ),
    ).toHaveLength(contentQueries);
    expect(f.calls).toContainEqual({
      table: "content",
      action: "order",
      args: ["created_at", { ascending: false }],
    });
    expect(f.calls).toContainEqual({
      table: "content",
      action: "order",
      args: ["id", { ascending: false }],
    });
    expect(f.calls).toContainEqual({ table: "content", action: "limit", args: [21] });
    expect(f.calls).toContainEqual({
      table: "scheduler_jobs",
      action: "eq",
      args: ["workspace_id", ws],
    });
  });
  it("filters title/body and a separately embedded brand without hiding the displayed original brand", async () => {
    const f = fixture();
    await run(f, { search: '50%_ "(x,y)"' });
    expect(
      f.calls
        .filter((c) => c.action === "select" && c.table === "content")
        .every((c) => String(c.args[0]).includes("matching_brand:brands()")),
    ).toBe(true);
    expect(f.calls).toContainEqual({
      table: "content",
      action: "filter",
      args: ["matching_brand.name", "imatch", '50%_ "\\(x,y\\)"'],
    });
    expect(
      f.calls.some(
        (c) => c.action === "or" && String(c.args[0]).includes("matching_brand.not.is.null"),
      ),
    ).toBe(true);
  });
  it("applies cursor and search together only to page rows, never to whole-library counters", async () => {
    const f = fixture(),
      cursor = { createdAt: "2026-11-12T13:00:00.123456+00:00", id: uuid(999) };
    const r = await run(f, { search: "unit", cursor });
    expect(r.requestCursor).toEqual(cursor);
    const ors = f.calls
      .filter((c) => c.table === "content" && c.action === "or")
      .map((c) => String(c.args[0]));
    expect(ors.filter((s) => s.includes("created_at.lt"))).toHaveLength(1);
    expect(ors.find((s) => s.includes("created_at.lt"))).toContain("and(or(title.imatch.");
    expect(r.counts.all).toBe(83);
  });
  it("keeps delivery locks for failed/archived statuses and paginates lock evidence", async () => {
    const jobs = Array.from({ length: 501 }, (_, i) => ({
      id: uuid(500 + i),
      content_id: i === 500 ? uuid(99) : uuid(100),
    }));
    const f = fixture({ jobs });
    const r = await run(f);
    expect(r.items.filter((i) => i.deliveryLocked).map((i) => i.id)).toEqual([uuid(100), uuid(99)]);
    expect(f.calls).toContainEqual({ table: "scheduler_jobs", action: "range", args: [500, 999] });
    const condition = String(
      f.calls.find((c) => c.table === "scheduler_jobs" && c.action === "or")?.args[0],
    );
    expect(condition).toContain("reconcile_state.in.(pending,review)");
    expect(condition).toContain("external_post_id.not.is.null");
  });
  it("never asks for locks outside the displayed page", async () => {
    const f = fixture();
    await run(f);
    const ids = f.calls.find((c) => c.table === "scheduler_jobs" && c.action === "in")
      ?.args[1] as string[];
    expect(ids).toHaveLength(20);
    expect(ids).not.toContain(uuid(80));
  });
  it("does not call an empty filtered result an empty workspace", async () => {
    const counts = {
      all: 0,
      draft: 0,
      archived: 0,
      scheduled: 0,
      publishing: 0,
      published: 0,
      failed: 0,
    };
    const f = fixture({ rows: [], counts });
    const r = await run(f, { status: "published" });
    expect(r.items).toEqual([]);
    expect(r.nextCursor).toBeNull();
    expect(f.calls.some((c) => c.table === "scheduler_jobs")).toBe(false);
  });
  it.each([
    { limit: 51 },
    { search: "x".repeat(201) },
    { workspaceId: "no" },
    { status: "no" },
    { cursor: { createdAt: "bad", id: uuid(3) } },
  ])("validates %o before any database access", async (patch) => {
    const f = fixture();
    await expect(run(f, patch)).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });
  it("refuses foreign or duplicate data instead of presenting it with enabled actions", async () => {
    for (const bad of [[{ ...row(10), workspace_id: uuid(2) }], [row(10), row(10)]])
      await expect(run(fixture({ rows: bad }))).rejects.toThrow();
  });
});
