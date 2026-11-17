import type { ContentBrowseItem, ContentCursor } from "@/lib/content/browse";

export interface PageSelection {
  scope: string;
  ids: string[];
}
export const contentPageScope = (
  workspaceId: string | null,
  status: string,
  search: string,
  cursor: ContentCursor | null,
) => JSON.stringify([workspaceId, status, search, cursor]);
export function canModifyContent(item: ContentBrowseItem): boolean {
  return !item.deliveryLocked && item.status !== "scheduled" && item.status !== "publishing";
}
/** A hidden, old-page, deleted or newly locked row can never become a bulk mutation target. */
export function currentPageSelection(
  selection: PageSelection,
  scope: string,
  items: ContentBrowseItem[],
  canEdit: boolean,
): Set<string> {
  if (!canEdit || selection.scope !== scope) return new Set();
  const allowed = new Set(items.filter(canModifyContent).map((i) => i.id));
  return new Set(selection.ids.filter((id) => allowed.has(id)));
}
