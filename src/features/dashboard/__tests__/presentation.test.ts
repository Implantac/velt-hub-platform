import { describe, expect, it } from "vitest";
import {
  canReadDashboard,
  DASHBOARD_QUERY_MODULES,
  dashboardActionHref,
  dashboardDate,
  dashboardLoadState,
  dashboardQueryKey,
  isDashboardQueryKey,
  needsDashboardSetup,
  shouldLoadDashboardAdvanced,
} from "../presentation";

// Query states are explicit: cached data after an error is stale, not zero/empty.
describe("dashboard loading and first-use decisions", () => {
  it.each([
    [undefined, false, "loading"],
    [undefined, true, "error"],
    [{ counts: { content: 0 } }, false, "ready"],
    [{ counts: { content: 5 } }, true, "stale"],
  ] as const)("classifies data=%j error=%s as %s", (data, isError, expected) => {
    expect(dashboardLoadState({ data, isError })).toBe(expected);
  });
  it.each([
    [0, 0, true],
    [1, 0, true],
    [0, 5, true],
    [1, 1, false],
  ])("essential counts %s/%s require setup=%s", (brands, content, expected) => {
    expect(needsDashboardSetup({ brands: brands as number, content: content as number })).toBe(
      expected,
    );
  });
  it("does not make an optional connected channel a prerequisite", () => {
    const counts = { brands: 1, content: 1, channelsConnected: 0 };
    expect(needsDashboardSetup(counts)).toBe(false);
  });
  it.each([
    [false, true, false, false],
    [false, false, true, false],
    [true, true, false, false],
    [true, true, true, true],
    [true, false, false, true],
  ])(
    "overview=%s setup=%s open=%s loads advanced=%s",
    (hasOverview, gettingStarted, open, expected) => {
      expect(shouldLoadDashboardAdvanced({ hasOverview, gettingStarted, open })).toBe(expected);
    },
  );
});

describe("dashboard user/workspace cache scope and safe actions", () => {
  it.each(DASHBOARD_QUERY_MODULES)("includes user and workspace for %s", (module) => {
    expect(dashboardQueryKey(module, "ws-a", "user-a")).toEqual([module, "ws-a", "user-a"]);
    expect(isDashboardQueryKey(dashboardQueryKey(module, "ws-a", "user-a"), "ws-a", "user-a")).toBe(
      true,
    );
    expect(isDashboardQueryKey(dashboardQueryKey(module, "ws-a", "user-b"), "ws-a", "user-a")).toBe(
      false,
    );
    expect(isDashboardQueryKey(dashboardQueryKey(module, "ws-b", "user-a"), "ws-a", "user-a")).toBe(
      false,
    );
  });
  it("does not refresh another module, legacy cache or a nested mutation", () => {
    for (const key of [
      ["brain-all", "ws-a", "user-a"],
      ["dashboard", "ws-a"],
      ["dashboard", "ws-a", "user-a", "nested"],
      [],
    ]) {
      expect(isDashboardQueryKey(key, "ws-a", "user-a")).toBe(false);
    }
  });
  it.each(["owner", "admin", "editor", "viewer"])("allows a known read role %s", (role) => {
    expect(canReadDashboard(role)).toBe(true);
  });
  it.each([null, undefined, "", "anonymous", "OWNER", "future-role"])(
    "fails closed for role %s",
    (role) => {
      expect(canReadDashboard(role)).toBe(false);
    },
  );
  it.each(["/app", "/app/content", "/app/content?status=draft#composer", "/app/brain"])(
    "allows same-origin app destination %s",
    (href) => {
      expect(dashboardActionHref(href)).toBe(href);
    },
  );
  it.each([
    null,
    undefined,
    1,
    "javascript:alert(1)",
    "//evil.invalid/app",
    "https://evil.invalid/app",
    "/login",
    "/application",
    "/app/../login",
    "/app\\evil",
    "/app/%2f%2fevil",
    "/app/%5Cevil",
    "/app/with space",
    "/app/%0Aevil",
  ])("rejects an unsafe/stale action %s instead of creating a link", (href) => {
    expect(dashboardActionHref(href)).toBeNull();
  });
});

describe("dashboard dates", () => {
  it("does not throw for invalid saved dates", () => {
    expect(dashboardDate("not-a-date", "pt-BR")).toBeNull();
  });
  it("formats in the explicit São Paulo zone in either UI language", () => {
    const pt = dashboardDate("2026-11-12T15:00:00Z", "pt-BR");
    const en = dashboardDate("2026-11-12T15:00:00Z", "en-US");
    expect(pt).toContain("12:00");
    expect(en).toMatch(/12:00/);
    expect(pt).not.toBe(en);
    expect(pt).toContain("2026");
  });
});
