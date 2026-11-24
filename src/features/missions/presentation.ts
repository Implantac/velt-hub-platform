import { PRODUCT_TZ } from "@/lib/growth/scheduling";
import { MISSION_MAX_PAGE, type MissionPage } from "@/lib/missions/contracts";

export type MissionFeedback = {
  kind: "created" | "statusSaved" | "unconfirmed" | "refreshed" | "refreshFailed";
  eventMissing?: boolean;
  readFailed?: boolean;
};

/** A fresh GET can clear a read warning, never turn an uncertain write into success. */
export function missionFeedbackAfterRead(
  current: MissionFeedback | null,
  confirmed: boolean,
): MissionFeedback {
  if (current?.kind === "unconfirmed") return current;
  if (current?.kind === "created" || current?.kind === "statusSaved")
    return { ...current, readFailed: !confirmed };
  return { kind: confirmed ? "refreshed" : "refreshFailed" };
}

export function missionsQueryRoot(workspaceId: string, userId: string) {
  return ["missions", workspaceId, userId] as const;
}
export function missionsQueryKey(
  workspaceId: string,
  userId: string,
  status: string,
  page: number,
) {
  return [...missionsQueryRoot(workspaceId, userId), status, page] as const;
}
export function canReadMissions(role: string | null | undefined) {
  return role === "owner" || role === "admin" || role === "editor" || role === "viewer";
}
export function missionReadState(query: { data: unknown; isError: boolean }) {
  if (query.data === undefined) return query.isError ? "error" : "loading";
  return query.isError ? "stale" : "ready";
}
export function missionLanguage(language: string) {
  return language.toLowerCase().split("-")[0] === "en" ? "en-US" : "pt-BR";
}
export function missionDate(value: string, language: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(missionLanguage(language), {
    timeZone: PRODUCT_TZ,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
export function missionPageRange(page: MissionPage) {
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const start = page.items.length ? (page.page - 1) * page.pageSize + 1 : 0;
  return {
    start,
    end: page.items.length ? start + page.items.length - 1 : 0,
    pages,
    outOfRange: page.page > pages,
    hasPrevious: page.page > 1,
    hasNext: page.page < Math.min(pages, MISSION_MAX_PAGE),
    reachedPageLimit: pages > MISSION_MAX_PAGE && page.page === MISSION_MAX_PAGE,
  };
}
