import { z } from "zod";

export const CONTENT_STATUSES = [
  "draft",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "archived",
] as const;
export const CONTENT_FILTERS = ["all", ...CONTENT_STATUSES] as const;
export const CONTENT_PAGE_SIZE = 20;
const printable = (character: string) =>
  character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127;
export const normalizeContentSearchInput = (value: string) =>
  Array.from(value).filter(printable).join("").slice(0, 200);
const timestamp = z
  .string()
  .max(40)
  .datetime({ offset: true })
  .refine((s) => {
    const fraction = s.match(/\.(\d+)/)?.[1] ?? "";
    return fraction.length <= 6 && Number.isFinite(Date.parse(s));
  });
export const contentCursorSchema = z.object({
  createdAt: timestamp,
  id: z.string().uuid().toLowerCase(),
});
export type ContentCursor = z.infer<typeof contentCursorSchema>;
export const contentBrowseInputSchema = z.object({
  workspaceId: z.string().uuid().toLowerCase(),
  status: z.enum(CONTENT_FILTERS).default("all"),
  search: z
    .string()
    .trim()
    .max(200)
    .refine((s) => Array.from(s).every(printable), "Search must be a single line")
    .default(""),
  cursor: contentCursorSchema.nullable().default(null),
  limit: z.number().int().min(1).max(50).default(CONTENT_PAGE_SIZE),
});
export type ContentBrowseInput = z.infer<typeof contentBrowseInputSchema>;
export const contentCountsSchema = z.object({
  all: z.number().int().nonnegative(),
  draft: z.number().int().nonnegative(),
  scheduled: z.number().int().nonnegative(),
  publishing: z.number().int().nonnegative(),
  published: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  archived: z.number().int().nonnegative(),
});
/** JSON values remain shape-agnostic; consumers use their own defensive parsers. */
export const contentBrowseRowSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  type: z.enum(["post", "reel", "story", "short", "video", "article", "carousel"]),
  title: z.string().nullable(),
  body: z.string().nullable(),
  media: z.json(),
  metadata: z.json(),
  status: z.enum(CONTENT_STATUSES),
  created_at: timestamp,
  updated_at: timestamp,
  brand: z.object({ name: z.string() }).nullable(),
});
export const contentBrowseItemSchema = contentBrowseRowSchema.extend({
  deliveryLocked: z.boolean(),
});
export type ContentBrowseItem = z.infer<typeof contentBrowseItemSchema>;
export const cursorForContent = (row: { id: string; created_at: string }): ContentCursor => ({
  createdAt: row.created_at,
  id: row.id,
});
function micros(at: string): bigint {
  const fraction = at.match(/\.(\d+)/)?.[1] ?? "";
  return BigInt(Date.parse(at)) * 1000n + BigInt(fraction.padEnd(6, "0").slice(3) || "0");
}
export function contentPrecedes(row: ContentCursor, previous: ContentCursor): boolean {
  const a = micros(row.createdAt),
    b = micros(previous.createdAt);
  return a < b || (a === b && row.id.toLowerCase() < previous.id.toLowerCase());
}
export const contentPageSchema = z
  .object({
    workspaceId: z.string().uuid().toLowerCase(),
    status: z.enum(CONTENT_FILTERS),
    search: z.string(),
    requestCursor: contentCursorSchema.nullable(),
    limit: z.number().int().min(1).max(50),
    items: z.array(contentBrowseItemSchema).max(50),
    counts: contentCountsSchema,
    workspaceTotal: z.number().int().nonnegative(),
    nextCursor: contentCursorSchema.nullable(),
  })
  .superRefine((value, ctx) => {
    let previous = value.requestCursor;
    let invalid = value.items.length > value.limit;
    const ids = new Set<string>();
    for (const item of value.items) {
      const cursor = cursorForContent(item);
      invalid ||=
        item.workspace_id !== value.workspaceId ||
        ids.has(item.id) ||
        (value.status !== "all" && item.status !== value.status) ||
        (!!previous && !contentPrecedes(cursor, previous)) ||
        (["scheduled", "publishing"].includes(item.status) && !item.deliveryLocked);
      ids.add(item.id);
      previous = cursor;
    }
    if (value.nextCursor)
      invalid ||=
        value.items.length !== value.limit ||
        JSON.stringify(value.nextCursor) !== JSON.stringify(previous);
    if (invalid) ctx.addIssue({ code: "custom", message: "Inconsistent content page" });
  });
export type ContentPage = z.infer<typeof contentPageSchema>;
export function parseContentPage(raw: unknown, requested: ContentBrowseInput): ContentPage {
  const page = contentPageSchema.parse(raw);
  if (
    page.workspaceId !== requested.workspaceId ||
    page.status !== requested.status ||
    page.search !== requested.search ||
    page.limit !== requested.limit ||
    JSON.stringify(page.requestCursor) !== JSON.stringify(requested.cursor)
  )
    throw new Error("Content page does not match the requested context");
  return page;
}
/** Literal, case-insensitive substring search. ILIKE also expands PostgREST's `*` alias,
 * so use an escaped regex instead; no user-controlled regex operators reach Postgres. */
export function contentSearchPattern(search: string): string {
  return search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/** One OR parameter only: a second .or() call would overwrite the first in PostgREST. */
export function contentOrFilter(search: string, cursor: ContentCursor | null): string | null {
  const pattern = JSON.stringify(contentSearchPattern(search));
  const text = search
    ? `title.imatch.${pattern},body.imatch.${pattern},matching_brand.not.is.null`
    : "";
  const at = cursor ? JSON.stringify(cursor.createdAt) : "";
  const older = cursor ? `created_at.lt.${at},and(created_at.eq.${at},id.lt.${cursor.id})` : "";
  return text && older ? `and(or(${text}),or(${older}))` : text || older || null;
}
