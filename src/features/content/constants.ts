import { CONTENT_FILTERS, CONTENT_STATUSES } from "@/lib/content/browse";
export { MANUAL_CONTENT_STATUSES } from "@/lib/content/status";
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export const STATUSES = CONTENT_STATUSES;
export const FILTERS = CONTENT_FILTERS;
export type FilterValue = (typeof FILTERS)[number];

export const STATUS_STYLES: Record<ContentStatus, string> = {
  draft: "bg-secondary text-secondary-foreground",
  scheduled: "bg-primary/15 text-primary",
  publishing: "bg-primary/15 text-primary",
  published: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
  archived: "bg-muted text-muted-foreground",
};
