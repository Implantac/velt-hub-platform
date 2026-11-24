import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assessment,
  at,
  earlier,
  input,
  operationId,
  otherUser,
  otherWorkspace,
  scope,
  uid,
  workspaceId,
} from "@/lib/skill-map/__tests__/fixtures";
import {
  SKILL_MEMBER_ROLES,
  skillSameInstant,
  type SkillAssessment,
} from "@/lib/skill-map/contracts";
type Query = { table: string; actions: { name: string; args: unknown[] }[] };
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
    let parse = (v: unknown) => v,
      middlewareCount = 0;
    const b = {
      middleware: (items: unknown[]) => {
        middlewareCount = items.length;
        return b;
      },
      validator: (fn: typeof parse) => {
        parse = fn;
        return b;
      },
      handler: (fn: Handler) =>
        Object.assign(
          async (args: Parameters<Handler>[0]) => fn({ ...args, data: parse(args.data) }),
          { method, middlewareCount },
        ),
    };
    return b;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { getSkillMap, saveSkillAssessment } from "../skill-map.functions";
const action = (q: Query, name: string, col?: string) =>
  q.actions.find((a) => a.name === name && (col === undefined || a.args[0] === col));
const writing = (q: Query) =>
  !!(action(q, "insert") || action(q, "update") || action(q, "upsert") || action(q, "delete"));
function fixture(
  options: {
    rows?: SkillAssessment[];
    role?: unknown;
    secondRole?: unknown;
    memberError?: boolean;
    override?: (q: Query, result: Result) => Result;
  } = {},
) {
  const queries: Query[] = [],
    rows = [...(options.rows ?? [assessment()])];
  let memberReads = 0;
  const context = {
    userId: uid,
    supabase: {
      from: (table: string) => {
        if (!["workspace_members", "skill_assessments"].includes(table))
          throw new Error("Unexpected side effect: " + table);
        const q: Query = { table, actions: [] };
        queries.push(q);
        const b: Record<string, unknown> = {};
        for (const name of [
          "select",
          "eq",
          "order",
          "limit",
          "insert",
          "update",
          "upsert",
          "delete",
        ])
          b[name] = (...args: unknown[]) => {
            q.actions.push({ name, args });
            return b;
          };
        const result = (): Result => {
          let out: Result;
          if (table === "workspace_members") {
            const first = Object.hasOwn(options, "role") ? options.role : "owner",
              role =
                memberReads++ === 0 || !Object.hasOwn(options, "secondRole")
                  ? first
                  : options.secondRole;
            out = {
              data: role === null ? null : { role },
              count: null,
              error: options.memberError ? { message: "synthetic membership error" } : null,
            };
          } else {
            const eq = (col: string) => action(q, "eq", col)?.args[1];
            const selected = rows.filter(
              (row) =>
                row.user_id === eq("user_id") &&
                row.workspace_id === eq("workspace_id") &&
                (!eq("area") || row.area === eq("area")),
            );
            let data: unknown = action(q, "maybeSingle") ? (selected[0] ?? null) : selected;
            let error: Result["error"] = null;
            if (action(q, "insert")) {
              const payload = action(q, "insert")!.args[0] as SkillAssessment;
              if (
                rows.some(
                  (row) =>
                    row.user_id === payload.user_id &&
                    row.workspace_id === payload.workspace_id &&
                    row.area === payload.area,
                )
              ) {
                data = null;
                error = { code: "23505", message: "synthetic unique area collision" };
              } else {
                rows.push(payload);
                data = payload;
              }
            } else if (action(q, "update")) {
              const current = selected.find(
                (row) =>
                  row.id === eq("id") &&
                  skillSameInstant(row.assessed_at, eq("assessed_at") as string),
              );
              if (current) {
                Object.assign(current, action(q, "update")!.args[0]);
                data = { ...current };
              } else data = null;
            }
            out = {
              data,
              count: action(q, "maybeSingle") || writing(q) ? null : selected.length,
              error,
            };
          }
          return options.override?.(q, out) ?? out;
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
  };
  return { context, queries, rows };
}
const run = (fn: unknown, f: ReturnType<typeof fixture>, data?: unknown) =>
  (fn as Handler)({ data, context: f.context });
const writes = (f: ReturnType<typeof fixture>) => f.queries.filter(writing);
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(at));
});
afterEach(() => vi.useRealTimers());

describe("Dedicated native Skill Map reads", () => {
  it("GET requires Auth and recognized membership, reads exact count with a stable bounded order, never writes", async () => {
    const f = fixture();
    const result = await run(getSkillMap, f, scope());
    expect((getSkillMap as unknown as Handler).method).toBe("GET");
    expect((getSkillMap as unknown as Handler).middlewareCount).toBe(1);
    expect(result).toMatchObject({ ...scope(), total: 1, items: [assessment()], checkedAt: at });
    expect(f.queries.map((q) => q.table)).toEqual(["workspace_members", "skill_assessments"]);
    expect(f.queries[0].actions).toEqual([
      { name: "select", args: ["role"] },
      { name: "eq", args: ["workspace_id", workspaceId] },
      { name: "eq", args: ["user_id", uid] },
      { name: "maybeSingle", args: [] },
    ]);
    expect(f.queries[1].actions).toEqual([
      { name: "select", args: ["*", { count: "exact" }] },
      { name: "eq", args: ["workspace_id", workspaceId] },
      { name: "eq", args: ["user_id", uid] },
      { name: "order", args: ["area", { ascending: true }] },
      { name: "order", args: ["id", { ascending: true }] },
      { name: "limit", args: [10] },
    ]);
    expect(writes(f)).toHaveLength(0);
  });
  it.for(SKILL_MEMBER_ROLES)("allows a member %s to read their own map", async (role) => {
    const f = fixture({ role });
    await expect(run(getSkillMap, f, scope())).resolves.toMatchObject({ total: 1 });
  });
  it("confirms a truly empty complete map without inventing notes or zero scores", async () => {
    const f = fixture({ rows: [] });
    expect(await run(getSkillMap, f, scope())).toMatchObject({ items: [], total: 0 });
    expect(writes(f)).toHaveLength(0);
  });
  it.for([
    null,
    undefined,
    {},
    { workspaceId },
    { ...scope(), accountId: "bad" },
    { ...scope(), userId: uid },
  ])("rejects ambiguous GET input before queries", async (value) => {
    const f = fixture();
    await expect(run(getSkillMap, f, value)).rejects.toThrow();
    expect(f.queries).toHaveLength(0);
  });
  it.each([getSkillMap, saveSkillAssessment])(
    "refuses an expected account different from current Auth before even membership lookup",
    async (fn) => {
      const f = fixture();
      await expect(
        run(
          fn,
          f,
          fn === getSkillMap
            ? { ...scope(), accountId: otherUser }
            : input({ accountId: otherUser, expected: null }),
        ),
      ).rejects.toThrow();
      expect(f.queries).toHaveLength(0);
    },
  );
  it.for([null, undefined, "", "OWNER", "administrator", 0, {}, ["viewer"]])(
    "fails closed on absent/unknown membership",
    async (role) => {
      const f = fixture({ role });
      await expect(run(getSkillMap, f, scope())).rejects.toThrow();
      expect(f.queries).toHaveLength(1);
      expect(writes(f)).toHaveLength(0);
    },
  );
  it("does not query assessments when membership lookup fails", async () => {
    const f = fixture({ memberError: true });
    await expect(run(getSkillMap, f, scope())).rejects.toThrow("synthetic membership error");
    expect(f.queries).toHaveLength(1);
  });
  it.for([
    null,
    undefined,
    {},
    [assessment({ user_id: otherUser })],
    [assessment({ workspace_id: otherWorkspace })],
    [assessment(), assessment({ id: operationId })],
    [assessment(), assessment({ area: "sales" })],
  ])(
    "rejects malformed/foreign/duplicate read transport rather than returning empty",
    async (data) => {
      const f = fixture({
        override: (q, result) => (q.table === "skill_assessments" ? { ...result, data } : result),
      });
      await expect(run(getSkillMap, f, scope())).rejects.toThrow();
      expect(writes(f)).toHaveLength(0);
    },
  );
  it.for([null, undefined, -1, 0, 2, 11, 0.5])(
    "requires a matching exact count: %j",
    async (count) => {
      const f = fixture({
        override: (q, result) =>
          q.table === "skill_assessments" ? { ...result, count: count as number | null } : result,
      });
      await expect(run(getSkillMap, f, scope())).rejects.toThrow();
    },
  );
  it("does not turn a database error into an empty map", async () => {
    const f = fixture({
      override: (q, result) =>
        q.table === "skill_assessments"
          ? { ...result, data: [], error: { message: "synthetic unavailable" } }
          : result,
    });
    await expect(run(getSkillMap, f, scope())).rejects.toThrow("synthetic unavailable");
  });
});

describe("Desired-state native Skill Map writes, without Brain side effects", () => {
  it("declares one authenticated POST and updates exactly the observed personal row/version", async () => {
    const f = fixture({ rows: [assessment()] });
    const result = await run(saveSkillAssessment, f, input());
    expect(result).toMatchObject({
      mode: "updated",
      operationId,
      assessment: {
        score: 0,
        notes: null,
        source: "self",
        confidence: 0.6,
        evidence: assessment().evidence,
        assessed_at: at,
      },
    });
    expect((saveSkillAssessment as unknown as Handler).method).toBe("POST");
    expect((saveSkillAssessment as unknown as Handler).middlewareCount).toBe(1);
    expect(f.queries.map((q) => q.table)).toEqual([
      "workspace_members",
      "skill_assessments",
      "workspace_members",
      "skill_assessments",
    ]);
    expect(writes(f)).toHaveLength(1);
    expect(writes(f)[0].actions).toEqual([
      { name: "update", args: [{ score: 0, notes: null, source: "self", assessed_at: at }] },
      { name: "eq", args: ["id", assessment().id] },
      { name: "eq", args: ["user_id", uid] },
      { name: "eq", args: ["workspace_id", workspaceId] },
      { name: "eq", args: ["area", "copy"] },
      { name: "eq", args: ["assessed_at", earlier] },
      { name: "select", args: [] },
      { name: "single", args: [] },
    ]);
  });
  it.for(SKILL_MEMBER_ROLES)("a %s member may update only their own record", async (role) => {
    const f = fixture({ rows: [assessment()], role });
    await expect(run(saveSkillAssessment, f, input())).resolves.toMatchObject({ mode: "updated" });
    expect(writes(f)).toHaveLength(1);
  });
  it("inserts only after confirmed absence with explicit actor/area/defaults/date and operation ID", async () => {
    const f = fixture({ rows: [] });
    const result = await run(
      saveSkillAssessment,
      f,
      input({ expected: null, notes: "  exact spaces  " }),
    );
    expect(result).toMatchObject({
      mode: "created",
      assessment: {
        id: operationId,
        user_id: uid,
        workspace_id: workspaceId,
        score: 0,
        confidence: 0.5,
        source: "self",
        notes: "  exact spaces  ",
        evidence: {},
        assessed_at: at,
      },
    });
    expect(action(writes(f)[0], "insert")).toBeDefined();
  });
  it("a second evaluation updates the UNIQUE current area instead of inserting again", async () => {
    const f = fixture({ rows: [] });
    const first = (await run(saveSkillAssessment, f, input({ expected: null }))) as {
      assessment: SkillAssessment;
    };
    vi.setSystemTime(new Date("2026-11-12T15:04:06.123Z"));
    const second = (await run(
      saveSkillAssessment,
      f,
      input({ expected: first.assessment, score: 100 }),
    )) as { assessment: SkillAssessment };
    expect(second.assessment.id).toBe(operationId);
    expect(second.assessment.score).toBe(100);
    expect(writes(f).map((q) => q.actions[0].name)).toEqual(["insert", "update"]);
    expect(f.rows).toHaveLength(1);
  });
  it("identical self score/notes is a no-op, preserving all legacy technical fields and date", async () => {
    const original = assessment({ confidence: -0.2, evidence: [null, "old"] }),
      f = fixture({ rows: [original] });
    expect(
      await run(
        saveSkillAssessment,
        f,
        input({ expected: original, score: original.score, notes: original.notes }),
      ),
    ).toMatchObject({ mode: "unchanged", recordedAt: null, assessment: original });
    expect(writes(f)).toHaveLength(0);
    expect(f.queries).toHaveLength(2);
  });
  it("an acknowledged source change becomes self without replacing confidence or original evidence", async () => {
    const original = assessment({
        source: "<i>inferred</i>",
        confidence: 1.75,
        evidence: [false, { legacy: "original" }],
      }),
      f = fixture({ rows: [original] });
    const result = await run(
      saveSkillAssessment,
      f,
      input({ expected: { ...original }, score: original.score, notes: original.notes }),
    );
    expect(result).toMatchObject({
      mode: "updated",
      assessment: { source: "self", confidence: 1.75, evidence: original.evidence },
    });
  });
  it.for([
    null,
    undefined,
    {},
    { workspaceId, area: "copy", score: 50 },
    { ...input(), expected: undefined },
    { ...input(), source: "self" },
    { ...input(), notes: "x".repeat(501) },
    { ...input(), score: 0.1 },
  ])("rejects old or ambiguous inputs before DB access", async (value) => {
    const f = fixture();
    await expect(run(saveSkillAssessment, f, value)).rejects.toThrow();
    expect(f.queries).toHaveLength(0);
  });
  it.for([
    assessment({ user_id: otherUser }),
    assessment({ workspace_id: otherWorkspace }),
    assessment({ area: "sales" }),
  ])("rejects a foreign expected row before queries", async (expected) => {
    const f = fixture();
    await expect(run(saveSkillAssessment, f, input({ expected }))).rejects.toThrow();
    expect(f.queries).toHaveLength(0);
  });
  it.for([null, "owner-unknown", undefined])(
    "denies writes to missing/unknown memberships",
    async (role) => {
      const f = fixture({ role });
      await expect(run(saveSkillAssessment, f, input())).rejects.toThrow();
      expect(writes(f)).toHaveLength(0);
      expect(f.queries).toHaveLength(1);
    },
  );
  it("rechecks membership immediately before mutation and refuses a revoked member", async () => {
    const f = fixture({ secondRole: null });
    await expect(run(saveSkillAssessment, f, input())).rejects.toThrow();
    expect(f.queries).toHaveLength(3);
    expect(writes(f)).toHaveLength(0);
  });
  it("does not INSERT on a failed pre-read, even when absence was expected", async () => {
    const f = fixture({
      rows: [],
      override: (q, result) =>
        q.table === "skill_assessments"
          ? { ...result, data: null, error: { message: "synthetic pre-read failure" } }
          : result,
    });
    await expect(run(saveSkillAssessment, f, input({ expected: null }))).rejects.toThrow(
      "synthetic pre-read failure",
    );
    expect(writes(f)).toHaveLength(0);
  });
  it.for([
    undefined,
    {},
    [],
    assessment({ user_id: otherUser }),
    assessment({ workspace_id: otherWorkspace }),
    assessment({ area: "sales" }),
  ])("rejects an invalid pre-read instead of treating it as absent", async (data) => {
    const f = fixture({
      rows: [],
      override: (q, result) => (q.table === "skill_assessments" ? { ...result, data } : result),
    });
    await expect(run(saveSkillAssessment, f, input({ expected: null }))).rejects.toThrow();
    expect(writes(f)).toHaveLength(0);
  });
  it.for([
    null,
    assessment({ score: 1 }),
    assessment({ notes: "changed" }),
    assessment({ source: "inferred" }),
    assessment({ confidence: 0.7 }),
    assessment({ evidence: {} }),
    assessment({ assessed_at: "2026-11-10T23:30:00.123457Z" }),
  ])("rejects any changed observed base before mutation", async (row) => {
    const f = fixture({ rows: row ? [row] : [] });
    await expect(run(saveSkillAssessment, f, input())).rejects.toThrow();
    expect(writes(f)).toHaveLength(0);
  });
  it("does not create if a record appeared after observed absence", async () => {
    const f = fixture();
    await expect(run(saveSkillAssessment, f, input({ expected: null }))).rejects.toThrow();
    expect(writes(f)).toHaveLength(0);
  });
  it("refuses a same-instant new timestamp before writing, without silently advancing the clock", async () => {
    const current = assessment({ assessed_at: "2026-11-12T12:04:05.123000-03:00" }),
      f = fixture({ rows: [current] });
    await expect(run(saveSkillAssessment, f, input({ expected: current }))).rejects.toThrow(
      "version did not change",
    );
    expect(writes(f)).toHaveLength(0);
  });
  it.for([
    null,
    undefined,
    {},
    [],
    { ...assessment(), score: 0, assessed_at: at, notes: "wrong" },
    { ...assessment(), score: 0, notes: null, assessed_at: earlier },
  ])("zero rows or an incomplete write acknowledgement is not success", async (data) => {
    const f = fixture({
      rows: [assessment()],
      override: (q, result) => (writing(q) ? { ...result, data } : result),
    });
    await expect(run(saveSkillAssessment, f, input())).rejects.toThrow();
    expect(writes(f)).toHaveLength(1);
  });
  it.for([
    { user_id: otherUser },
    { workspace_id: otherWorkspace },
    { area: "sales" },
    { id: operationId },
    { confidence: 0.9 },
    { evidence: {} },
    { source: "inferred" },
    { score: 100 },
  ])("verifies every returned scope/metadata field before success", async (patch) => {
    const f = fixture({
      rows: [assessment()],
      override: (q, result) =>
        writing(q) ? { ...result, data: { ...(result.data as object), ...patch } } : result,
    });
    await expect(run(saveSkillAssessment, f, input())).rejects.toThrow();
    expect(writes(f)).toHaveLength(1);
  });
  it("does not retry or run a secondary action when DB write outcome is unknown", async () => {
    const f = fixture({
      rows: [assessment()],
      override: (q, result) =>
        writing(q)
          ? { ...result, data: null, error: { message: "synthetic lost write acknowledgement" } }
          : result,
    });
    await expect(run(saveSkillAssessment, f, input())).rejects.toThrow(
      "synthetic lost write acknowledgement",
    );
    expect(writes(f)).toHaveLength(1);
    expect(f.queries).toHaveLength(4);
  });
});
