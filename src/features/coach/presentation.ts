import { z } from "zod";
import {
  COACH_MAX_PAGE,
  COACH_PAGE_SIZE,
  COACH_READ_ROLES,
  type CoachFilter,
  type CoachPanel,
  type JourneyRecord,
} from "@/lib/coach/contracts";

export const coachQueryRoot = (workspaceId: string, userId: string) =>
  ["coach", workspaceId, userId] as const;
export const coachQueryKey = (
  workspaceId: string,
  userId: string,
  panel: CoachPanel,
  page: number,
  status?: CoachFilter,
) => [...coachQueryRoot(workspaceId, userId), panel, status ?? "all", page] as const;
export function canReadCoach(role: string | null | undefined) {
  return COACH_READ_ROLES.some((allowed) => allowed === role);
}
export function coachReadState(query: { data: unknown; isError: boolean }) {
  return query.data === undefined
    ? query.isError
      ? "error"
      : "loading"
    : query.isError
      ? "stale"
      : "ready";
}
export const coachLanguage = (value: string) => (value.startsWith("en") ? "en-US" : "pt-BR");
export function coachDate(value: string, language: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Intl.DateTimeFormat(coachLanguage(language), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(time);
}
export function coachPageRange(data: { page: number; total: number; items: unknown[] }) {
  const offset = (data.page - 1) * COACH_PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(data.total / COACH_PAGE_SIZE));
  return {
    start: data.items.length ? offset + 1 : 0,
    end: data.items.length ? offset + data.items.length : 0,
    pages,
    hasPrevious: data.page > 1,
    hasNext: data.page < pages && data.page < COACH_MAX_PAGE,
    outOfRange: data.page > pages,
    reachedPageLimit: data.page === COACH_MAX_PAGE && pages > COACH_MAX_PAGE,
  };
}
export function nativeCoachJourney(row: JourneyRecord) {
  const payload = z
    .object({
      source: z.literal("velt-coach-v2"),
      batchId: z.string().uuid(),
      count: z.number().int().min(1).max(8),
    })
    .safeParse(row.payload);
  return payload.success &&
    row.kind === "signal" &&
    row.subject === "Coach registrou um novo lote de recomendações"
    ? payload.data
    : null;
}
export type CoachFeedback = {
  kind: "generated" | "statusSaved" | "unconfirmed" | "refreshed";
  generated?: number;
  reference?: string;
  eventMissing?: boolean;
  readFailed?: boolean;
  journeyReadFailed?: boolean;
};
export function coachFeedbackAfterRead(current: CoachFeedback | null, confirmed: boolean) {
  if (current?.kind === "unconfirmed") return current;
  if (current?.kind === "generated" || current?.kind === "statusSaved")
    return { ...current, readFailed: !confirmed };
  return confirmed ? { kind: "refreshed" as const } : null;
}
