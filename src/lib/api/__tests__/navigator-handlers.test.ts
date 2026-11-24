import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  answers,
  at,
  earlier,
  input,
  legacy,
  otherRevision,
  otherUser,
  profile,
  revisionId,
  userId,
} from "@/lib/navigator/__tests__/fixtures";
import { navigatorProfilePayload } from "@/lib/navigator/model";
import { nativeNavigatorPlan, type NavigatorRecord } from "@/lib/navigator/contracts";
type Query = { table: string; actions: Array<{ name: string; args: unknown[] }> };
type Result = { data: unknown; error: { message: string; code?: string } | null };
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
import { getDigitalProfile, saveDigitalProfile } from "../navigator.functions";
const action = (q: Query, name: string, column?: string) =>
  q.actions.find((a) => a.name === name && (column === undefined || a.args[0] === column));
const existing = () => profile({ created_at: earlier, updated_at: earlier });
function fixture(
  override: (q: Query, result: Result) => Result = (_, result) => result,
  row: NavigatorRecord | null = existing(),
) {
  const queries: Query[] = [];
  return {
    queries,
    context: {
      userId,
      supabase: {
        from: (table: string) => {
          if (table !== "user_profile_digital")
            throw new Error("Unexpected table/hidden effect " + table);
          const q: Query = { table, actions: [] };
          queries.push(q);
          const b: Record<string, unknown> = {};
          for (const name of ["select", "eq", "insert", "update", "upsert", "delete"])
            b[name] = (...args: unknown[]) => {
              q.actions.push({ name, args });
              return b;
            };
          const result = () => {
            const inserted = action(q, "insert")?.args[0],
              updated = action(q, "update")?.args[0];
            return override(q, {
              data:
                inserted ?? (updated ? { ...row, ...(updated as object), updated_at: at } : row),
              error: null,
            });
          };
          for (const name of ["single", "maybeSingle"])
            b[name] = async () => {
              q.actions.push({ name, args: [] });
              return result();
            };
          return b;
        },
      },
    },
  };
}
const run = (fn: unknown, f: ReturnType<typeof fixture>, data?: unknown) =>
  (fn as Handler)({ data, context: f.context });
const updateInput = () => input({ expectedUpdatedAt: earlier });
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(at));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Navigator personal GET handler", () => {
  it("requires Auth and reads only user_id; has no workspace, role or generation side effects", async () => {
    const f = fixture();
    expect(await run(getDigitalProfile, f)).toEqual(existing());
    expect((getDigitalProfile as unknown as Handler).method).toBe("GET");
    expect((getDigitalProfile as unknown as Handler).middlewareCount).toBe(1);
    expect(f.queries).toEqual([
      {
        table: "user_profile_digital",
        actions: [
          { name: "select", args: ["*"] },
          { name: "eq", args: ["user_id", userId] },
          { name: "maybeSingle", args: [] },
        ],
      },
    ]);
  });
  it("returns exact null only when the read explicitly confirms absence", async () => {
    const f = fixture((_, result) => ({ ...result, data: null }));
    expect(await run(getDigitalProfile, f)).toBeNull();
  });
  it.each([undefined, {}, [], { user_id: userId }, profile({ user_id: otherUser })])(
    "does not turn invalid/foreign data into an empty profile: %j",
    async (data) => {
      const f = fixture((_, result) => ({ ...result, data }));
      await expect(run(getDigitalProfile, f)).rejects.toThrow();
      expect(f.queries).toHaveLength(1);
    },
  );
  it("propagates a database error rather than presenting absence or attempting a write", async () => {
    const f = fixture((_, result) => ({
      ...result,
      data: null,
      error: { message: "synthetic read unavailable" },
    }));
    await expect(run(getDigitalProfile, f)).rejects.toThrow("synthetic read unavailable");
    expect(f.queries).toHaveLength(1);
  });
  it("preserves an earlier profile without rewriting onboarding, actions or raw answers", async () => {
    const row = legacy({
      time_budget_hours_week: 120,
      money_budget_monthly: 900000.45,
      goals: [" Original "],
    });
    const f = fixture((_, result) => ({ ...result, data: row }));
    expect(await run(getDigitalProfile, f)).toEqual(row);
    expect(f.queries[0].actions.some((a) => ["insert", "update", "upsert"].includes(a.name))).toBe(
      false,
    );
  });
  it("fails closed on a malformed declared v2 profile, not silently as legacy", async () => {
    const f = fixture((_, result) => ({ ...result, data: profile({ maturity_level: "scaling" }) }));
    await expect(run(getDigitalProfile, f)).rejects.toThrow();
  });
});

describe.each([
  ["create", () => input()],
  ["update", updateInput],
] as const)("Navigator %s POST", (name, request) => {
  it("requires Auth, writes only the caller's complete personal revision and confirms a full receipt", async () => {
    const f = fixture(),
      result = await run(saveDigitalProfile, f, request());
    expect((saveDigitalProfile as unknown as Handler).method).toBe("POST");
    expect((saveDigitalProfile as unknown as Handler).middlewareCount).toBe(1);
    expect(result).toMatchObject({
      mode: name === "create" ? "created" : "updated",
      profile: { user_id: userId, ...answers(), completed_at: at },
    });
    expect(f.queries).toHaveLength(1);
    expect(f.queries[0].table).toBe("user_profile_digital");
    const q = f.queries[0],
      write = action(q, name === "create" ? "insert" : "update")!;
    expect(write.args[0]).toMatchObject({
      user_id: userId,
      ...navigatorProfilePayload(answers(), revisionId, at),
    });
    expect(action(q, "upsert")).toBeUndefined();
    expect(action(q, "delete")).toBeUndefined();
    expect(action(q, "select")?.args).toEqual(["*"]);
    expect(action(q, "single")).toBeDefined();
    if (name === "create") expect(write.args[0]).toMatchObject({ created_at: at, updated_at: at });
    else {
      expect(q.actions.filter((a) => a.name === "eq").map((a) => a.args)).toEqual([
        ["user_id", userId],
        ["updated_at", earlier],
      ]);
      expect(write.args[0]).not.toHaveProperty("created_at");
      expect(write.args[0]).not.toHaveProperty("updated_at");
    }
  });
  it.each([null, undefined, {}, []])(
    "does not accept a resolved mutation with no complete returned row: %j",
    async (data) => {
      const f = fixture((_, result) => ({ ...result, data }));
      await expect(run(saveDigitalProfile, f, request())).rejects.toThrow();
      expect(f.queries).toHaveLength(1);
    },
  );
  it("rejects a response from another owner without doing any second write", async () => {
    const f = fixture((_, result) => ({
      ...result,
      data: { ...(result.data as object), user_id: otherUser },
    }));
    await expect(run(saveDigitalProfile, f, request())).rejects.toThrow();
    expect(f.queries).toHaveLength(1);
  });
  it("rejects changed answers even when the derived actions would not change", async () => {
    const f = fixture((_, result) => ({
      ...result,
      data: { ...(result.data as object), money_budget_monthly: 15 },
    }));
    await expect(run(saveDigitalProfile, f, request())).rejects.toThrow();
  });
  it("rejects an otherwise internally consistent receipt with another revision ID", async () => {
    const f = fixture((_, result) => ({
      ...result,
      data: {
        ...(result.data as object),
        ...navigatorProfilePayload(answers(), otherRevision, at),
      },
    }));
    await expect(run(saveDigitalProfile, f, request())).rejects.toThrow();
  });
  it("does not silently accept a legacy or truncated response", async () => {
    const f = fixture((_, result) => ({ ...result, data: legacy() }));
    await expect(run(saveDigitalProfile, f, request())).rejects.toThrow();
    const g = fixture((_, result) => {
      const row = structuredClone(result.data) as NavigatorRecord;
      delete (row as Partial<NavigatorRecord>).content_preferences;
      return { ...result, data: row };
    });
    await expect(run(saveDigitalProfile, g, request())).rejects.toThrow();
  });
  it("requires matching canonical rule content, not just the expected number of actions", async () => {
    const f = fixture((_, result) => {
      const row = result.data as NavigatorRecord,
        method = nativeNavigatorPlan(row)!;
      method.actions[0].title = "Changed text";
      return { ...result, data: { ...row, recommended_actions: method.actions } };
    });
    await expect(run(saveDigitalProfile, f, request())).rejects.toThrow();
  });
  it("propagates a database/transport failure with no automatic retry, upsert or secondary onboarding write", async () => {
    const f = fixture((_, result) => ({
      ...result,
      error: { message: "synthetic conflict", code: "PGRST116" },
    }));
    await expect(run(saveDigitalProfile, f, request())).rejects.toThrow("synthetic conflict");
    expect(f.queries).toHaveLength(1);
  });
  it("trims/deduplicates the explicit input once, retaining unknown valid earlier choices", async () => {
    const raw = request();
    raw.answers = answers({
      goals: [" Original ", "Original"],
      preferred_channels: [" Earlier channel ", "Earlier channel"],
    });
    const f = fixture(),
      result = (await run(saveDigitalProfile, f, raw)) as { profile: NavigatorRecord };
    expect(result.profile.goals).toEqual(["Original"]);
    expect(result.profile.preferred_channels).toEqual(["Earlier channel"]);
    expect(raw.answers.goals).toEqual([" Original ", "Original"]);
  });
});

describe("Navigator CAS and strict boundary failures", () => {
  it("uses INSERT rather than UPSERT when absence was read; concurrent creation failure does not overwrite", async () => {
    const f = fixture((_, result) => ({
      ...result,
      data: null,
      error: { code: "23505", message: "synthetic duplicate personal PK" },
    }));
    await expect(run(saveDigitalProfile, f, input())).rejects.toThrow("synthetic duplicate");
    expect(f.queries).toHaveLength(1);
    expect(action(f.queries[0], "insert")).toBeDefined();
    expect(action(f.queries[0], "update")).toBeUndefined();
  });
  it("retains the exact high-precision expected token in the database predicate", async () => {
    const version = "2026-11-12T14:00:00.123456+00:00",
      f = fixture();
    await run(saveDigitalProfile, f, input({ expectedUpdatedAt: version }));
    expect(action(f.queries[0], "eq", "updated_at")?.args).toEqual(["updated_at", version]);
  });
  it("does not confirm an update if the returned version did not advance", async () => {
    const f = fixture((_, result) => ({
      ...result,
      data: { ...(result.data as object), updated_at: earlier },
    }));
    await expect(run(saveDigitalProfile, f, updateInput())).rejects.toThrow();
  });
  it.each([
    {},
    answers(),
    { ...input(), expectedUpdatedAt: undefined },
    { ...input(), user_id: otherUser },
    { ...input(), workspaceId: "unrequested" },
    input({ answers: { ...answers(), time_budget_hours_week: 169 } }),
    input({ answers: { ...answers(), money_budget_monthly: 1.001 } }),
    { ...input(), revisionId: "bad" },
  ])(
    "rejects incomplete, old-flat or malicious input before constructing queries: %j",
    async (data) => {
      const f = fixture();
      await expect(run(saveDigitalProfile, f, data)).rejects.toThrow();
      expect(f.queries).toHaveLength(0);
    },
  );
});
