import { safeAppReturnTo } from "@/lib/auth/return-to";
import { PRODUCT_TZ } from "@/lib/growth/scheduling";

export type DashboardLoadState = "loading" | "error" | "stale" | "ready";
export function dashboardLoadState(query: { data: unknown; isError: boolean }): DashboardLoadState {
  if (query.data === undefined) return query.isError ? "error" : "loading";
  return query.isError ? "stale" : "ready";
}

export const DASHBOARD_QUERY_MODULES = [
  "dashboard",
  "dashboard-analysis",
  "dashboard-health",
  "dashboard-recommendations",
  "dashboard-opportunities",
  "dashboard-blueprint",
  "dashboard-competitors",
  "dashboard-skills",
  "dashboard-journey",
] as const;
export type DashboardQueryModule = (typeof DASHBOARD_QUERY_MODULES)[number];
export function dashboardQueryKey(
  module: DashboardQueryModule,
  workspaceId: string,
  userId: string,
) {
  return [module, workspaceId, userId] as const;
}
export function isDashboardQueryKey(key: readonly unknown[], workspaceId: string, userId: string) {
  return (
    key.length === 3 &&
    key[1] === workspaceId &&
    key[2] === userId &&
    DASHBOARD_QUERY_MODULES.some((module) => module === key[0])
  );
}
export function canReadDashboard(role: string | null | undefined) {
  return role === "owner" || role === "admin" || role === "editor" || role === "viewer";
}
export function needsDashboardSetup(counts: { brands: number; content: number }) {
  // Social authorization is optional; it must not keep the essential setup incomplete.
  return counts.brands === 0 || counts.content === 0;
}
export function shouldLoadDashboardAdvanced(input: {
  hasOverview: boolean;
  gettingStarted: boolean;
  open: boolean;
}) {
  return input.hasOverview && (!input.gettingStarted || input.open);
}
/** Stored or AI-provided actions cannot introduce an external/script navigation. */
export function dashboardActionHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const safe = safeAppReturnTo(value);
  return safe === value ? safe : null;
}
/** All dashboard dates use the product IANA zone, not the server/browser default. */
export function dashboardDate(value: string, language: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(language, {
    timeZone: PRODUCT_TZ,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
