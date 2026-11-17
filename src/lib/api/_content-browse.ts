import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import {
  CONTENT_FILTERS,
  contentBrowseRowSchema,
  contentCountsSchema,
  contentOrFilter,
  contentPageSchema,
  contentSearchPattern,
  cursorForContent,
  type ContentBrowseInput,
} from "@/lib/content/browse";
import { requireWorkspaceRole } from "./_workspace";
import { throwIfError } from "./_supabase";
import { readAllPages } from "./_pagination";

const ROWS =
  "id,workspace_id,type,title,body,media,metadata,status,created_at,updated_at,brand:brands(name),matching_brand:brands()" as const;
const COUNTS = "id,matching_brand:brands()" as const;
/** Exactly the active/uncertain predicate in guard_content_delivery; no provider operation. */
const DELIVERY_LOCK =
  "status.in.(pending,processing),reconcile_state.in.(pending,review),and(status.eq.dead_letter,external_post_id.not.is.null,reconcile_state.eq.none)";

export async function readContentPage(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: ContentBrowseInput,
) {
  await requireWorkspaceRole(supabase, input.workspaceId, userId);
  const query = (
    head: boolean,
    status = input.status,
    search = input.search,
    cursor = input.cursor,
  ) => {
    let q = supabase
      .from("content")
      .select(head ? COUNTS : ROWS, { head, ...(head ? { count: "exact" as const } : {}) })
      .eq("workspace_id", input.workspaceId);
    if (status !== "all") q = q.eq("status", status);
    if (search) q = q.filter("matching_brand.name", "imatch", contentSearchPattern(search));
    const or = contentOrFilter(search, cursor);
    if (or) q = q.or(or);
    return q;
  };
  const count = async (status: typeof input.status, search = input.search) => {
    const result = await query(true, status, search, null);
    throwIfError(result.error);
    if (!Number.isSafeInteger(result.count) || result.count! < 0)
      throw new Error("Content count unavailable");
    return result.count!;
  };
  // Counts cover the entire matching library, never only the current cursor/page.
  // Concurrent writes may change these independent reads; this is not a historical snapshot.
  const [page, counted, workspaceCount] = await Promise.all([
    query(false)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(input.limit + 1),
    Promise.all(CONTENT_FILTERS.map(async (status) => [status, await count(status)] as const)),
    input.search ? count("all", "") : Promise.resolve(null),
  ]);
  throwIfError(page.error);
  if (!page.data) throw new Error("Content rows unavailable");
  const counts = contentCountsSchema.parse(Object.fromEntries(counted));
  const rows = z.array(contentBrowseRowSchema).parse(page.data);
  const visible = rows.slice(0, input.limit);
  const locks =
    visible.length === 0
      ? []
      : await readAllPages(
          (first, last) =>
            supabase
              .from("scheduler_jobs")
              .select("id,content_id")
              .eq("workspace_id", input.workspaceId)
              .in(
                "content_id",
                visible.map((r) => r.id),
              )
              .or(DELIVERY_LOCK)
              .order("id", { ascending: true })
              .range(first, last),
          { maxRows: 50_000 },
        );
  const locked = new Set(locks.map((j) => j.content_id));
  return contentPageSchema.parse({
    workspaceId: input.workspaceId,
    status: input.status,
    search: input.search,
    requestCursor: input.cursor,
    limit: input.limit,
    items: visible.map((row) => ({
      ...row,
      deliveryLocked: locked.has(row.id) || ["scheduled", "publishing"].includes(row.status),
    })),
    counts,
    workspaceTotal: workspaceCount ?? counts.all,
    nextCursor: rows.length > input.limit ? cursorForContent(visible[visible.length - 1]) : null,
  });
}
