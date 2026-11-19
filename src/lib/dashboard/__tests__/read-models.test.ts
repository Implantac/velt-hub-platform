import { describe, expect, it } from "vitest";
import type { Json } from "@/integrations/supabase/types";
import { dashboardCount, dashboardOptionalRow, dashboardRows } from "../overview";
import { DASHBOARD_QUESTIONS, savedDashboardAnswer, savedDashboardScore } from "../saved-analysis";

const checkedAt = "2026-11-12T15:00:00Z";
const row = {
  question: "where_am_i" as const,
  answer: {
    question: "where_am_i",
    headline: "Saved, not generated on read",
    confidence: 0,
    cta: { href: "/app/content", label: "Open content" },
  },
  computed_at: "2026-11-12T12:00:00Z",
  expires_at: null as string | null,
};

describe("dashboard result boundaries", () => {
  it.each([0, 1, 1_205, Number.MAX_SAFE_INTEGER])("keeps confirmed exact count %s", (count) => {
    expect(dashboardCount({ count, error: null })).toBe(count);
  });
  it.each([null, undefined, -1, 0.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "never substitutes zero for invalid count %s",
    (count) => {
      expect(() => dashboardCount({ count: count as number | null, error: null })).toThrow(
        "counts were not returned",
      );
    },
  );
  it("checks an error even if a response contains a count or rows", () => {
    const error = { message: "read unavailable" };
    expect(() => dashboardCount({ count: 0, error })).toThrow("read unavailable");
    expect(() => dashboardRows({ data: [], error })).toThrow("read unavailable");
    expect(() => dashboardOptionalRow({ data: null, error })).toThrow("read unavailable");
  });
  it("distinguishes confirmed empty lists/optional rows from a malformed response", () => {
    expect(dashboardRows({ data: [], error: null })).toEqual([]);
    expect(dashboardOptionalRow({ data: null, error: null })).toBeNull();
    expect(dashboardOptionalRow({ data: { id: "one" }, error: null })).toEqual({ id: "one" });
    expect(() => dashboardRows({ data: null, error: null })).toThrow("rows were not returned");
    expect(() => dashboardOptionalRow({ data: undefined, error: null })).toThrow(
      "row was not returned",
    );
  });
});

describe("saved analyses cannot become an invented zero/new answer", () => {
  it("returns absence, while a genuine zero score remains a score", () => {
    expect(savedDashboardScore(null)).toBeNull();
    expect(savedDashboardScore({ scores: { overall: 0 }, computed_at: checkedAt })).toEqual({
      overall: 0,
      computedAt: checkedAt,
    });
  });
  it.each([null, {}, { overall: null }, { overall: -1 }, { overall: 101 }, { overall: "0" }])(
    "rejects a malformed saved score %j",
    (scores) => {
      expect(() => savedDashboardScore({ scores, computed_at: checkedAt })).toThrow();
    },
  );
  it("rejects invalid saved timestamps", () => {
    expect(() =>
      savedDashboardScore({ scores: { overall: 80 }, computed_at: "not-a-date" }),
    ).toThrow();
    expect(() => savedDashboardAnswer({ ...row, expires_at: "not-a-date" }, checkedAt)).toThrow();
  });
  it("preserves original content, an actual zero confidence and absence of expiration", () => {
    expect(savedDashboardAnswer(row, checkedAt)).toMatchObject({
      headline: row.answer.headline,
      confidence: 0,
      computedAt: row.computed_at,
      expiresAt: null,
      expired: false,
    });
  });
  it.each([
    ["2026-11-12T14:59:59Z", true],
    [checkedAt, true],
    ["2026-11-12T15:00:01Z", false],
  ] as const)("marks saved expiration %s without regenerating it", (expires_at, expired) => {
    expect(savedDashboardAnswer({ ...row, expires_at }, checkedAt).expired).toBe(expired);
  });
  it("rejects answers accidentally stored under another question", () => {
    expect(() => savedDashboardAnswer({ ...row, question: "next_action" }, checkedAt)).toThrow(
      "does not match",
    );
  });
  it.each([
    { headline: "" },
    { confidence: -1 },
    { confidence: 1.1 },
    { question: "unknown" },
    { cta: { href: 123, label: "Open" } },
  ])("rejects malformed saved answer fields %j", (change) => {
    expect(() =>
      savedDashboardAnswer({ ...row, answer: { ...row.answer, ...change } as Json }, checkedAt),
    ).toThrow();
  });
  it("declares each canonical question once", () => {
    expect(DASHBOARD_QUESTIONS).toHaveLength(5);
    expect(new Set(DASHBOARD_QUESTIONS).size).toBe(5);
  });
});
