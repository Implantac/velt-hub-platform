import { z } from "zod";

export const MISSION_STATUSES = ["pending", "in_progress", "done", "dismissed"] as const;
export const MISSION_PAGE_SIZE = 20;
export const MISSION_MAX_PAGE = 100_000;
export const missionStatusSchema = z.enum(MISSION_STATUSES);
export const missionFilterSchema = z.enum(["all", ...MISSION_STATUSES]);
const uuid = z.string().uuid();
const timestamp = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)));
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const missionBrowseSchema = z.object({
  status: missionFilterSchema.default("all"),
  page: z.number().int().min(1).max(MISSION_MAX_PAGE).default(1),
});
export const missionListInputSchema = missionBrowseSchema.extend({ workspaceId: uuid });
export const missionDraftSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).default(""),
  priority: z.number().int().min(0).max(10).default(0),
});
export const missionCreateInputSchema = missionDraftSchema.extend({ workspaceId: uuid });
export const missionStatusInputSchema = z
  .object({
    workspaceId: uuid,
    id: uuid,
    status: missionStatusSchema,
    expectedStatus: missionStatusSchema,
    // Preserve the database's full timestamp precision as an opaque version.
    expectedUpdatedAt: timestamp,
  })
  .refine((input) => input.status !== input.expectedStatus, "Choose a different mission status.");

/** Read legacy saved text as-is; input constraints apply to new drafts, not history. */
export const missionRecordSchema = z.object({
  id: uuid,
  workspace_id: uuid,
  title: z.string(),
  description: z.string().nullable(),
  status: missionStatusSchema,
  priority: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  due_at: timestamp.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
  created_by: uuid.nullable(),
});
export const missionPageSchema = z
  .object({
    workspaceId: uuid,
    status: missionFilterSchema,
    page: z.number().int().min(1).max(MISSION_MAX_PAGE),
    pageSize: z.literal(MISSION_PAGE_SIZE),
    items: z.array(missionRecordSchema).max(MISSION_PAGE_SIZE),
    total: count,
    checkedAt: timestamp,
  })
  .refine((page) => {
    const offset = (page.page - 1) * page.pageSize;
    const expected = Math.min(page.pageSize, Math.max(0, page.total - offset));
    return (
      page.items.length === expected &&
      new Set(page.items.map((item) => item.id)).size === page.items.length &&
      page.items.every(
        (item) =>
          item.workspace_id === page.workspaceId &&
          (page.status === "all" || item.status === page.status),
      )
    );
  }, "Mission page, confirmed count, scope or filter do not match.");
export const missionCreationReceiptSchema = z.object({
  mission: missionRecordSchema,
  eventRecorded: z.boolean(),
});
export type MissionStatus = z.infer<typeof missionStatusSchema>;
export type MissionFilter = z.infer<typeof missionFilterSchema>;
export type MissionBrowse = z.infer<typeof missionBrowseSchema>;
export type MissionDraft = z.infer<typeof missionDraftSchema>;
export type MissionRecord = z.infer<typeof missionRecordSchema>;
export type MissionPage = z.infer<typeof missionPageSchema>;
export type MissionCreateInput = z.infer<typeof missionCreateInputSchema>;
export type MissionStatusInput = z.infer<typeof missionStatusInputSchema>;

/** Validate transport output again before rendering data for the requested context. */
export function confirmMissionPage(value: unknown, input: z.infer<typeof missionListInputSchema>) {
  const page = missionPageSchema.parse(value);
  if (
    page.workspaceId !== input.workspaceId ||
    page.status !== input.status ||
    page.page !== input.page
  )
    throw new Error("The requested mission page was not confirmed.");
  return page;
}
export function confirmMissionCreation(value: unknown, input: MissionCreateInput, userId: string) {
  const receipt = missionCreationReceiptSchema.parse(value);
  const row = receipt.mission;
  if (
    row.workspace_id !== input.workspaceId ||
    row.title !== input.title ||
    row.description !== (input.description || null) ||
    row.priority !== input.priority ||
    row.status !== "pending" ||
    row.created_by !== userId
  )
    throw new Error("The saved mission was not confirmed.");
  return receipt;
}
export function confirmMissionStatus(value: unknown, input: MissionStatusInput) {
  const row = missionRecordSchema.parse(value);
  if (row.id !== input.id || row.workspace_id !== input.workspaceId || row.status !== input.status)
    throw new Error("The mission status change was not confirmed.");
  return row;
}
