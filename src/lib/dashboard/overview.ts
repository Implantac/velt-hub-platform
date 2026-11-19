import type { Database } from "@/integrations/supabase/types";
import { throwIfError, type SupabaseLikeError } from "@/lib/api/_supabase";

export const DASHBOARD_CONTENT_STATUSES = [
  "draft",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "archived",
] as const satisfies readonly Database["public"]["Enums"]["content_status"][];
export const DASHBOARD_PREVIEW_LIMIT = 5;

/** A missing/invalid exact count is unavailable, never a confirmed zero. */
export function dashboardCount(result: {
  count: number | null;
  error: SupabaseLikeError | null;
}): number {
  throwIfError(result.error);
  if (result.count === null || !Number.isSafeInteger(result.count) || result.count < 0) {
    throw new Error("Dashboard exact counts were not returned.");
  }
  return result.count;
}

export function dashboardRows<T>(result: {
  data: T[] | null;
  error: SupabaseLikeError | null;
}): T[] {
  throwIfError(result.error);
  if (!Array.isArray(result.data)) throw new Error("Dashboard rows were not returned.");
  return result.data;
}

/** Null is a confirmed absence from maybeSingle; undefined is not a successful read. */
export function dashboardOptionalRow<T>(result: {
  data: T | null;
  error: SupabaseLikeError | null;
}): T | null {
  throwIfError(result.error);
  if (result.data === undefined) throw new Error("Dashboard row was not returned.");
  return result.data;
}
