import { z } from "zod";

export const LEARNING_PAGE_SIZE = 20;
const uuid = z.string().uuid();
const integer = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
export const learningTimestamp = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)));
/** Keep PostgreSQL fractional seconds; Date.parse alone loses microseconds. */
export function learningSameInstant(a: string, b: string) {
  const key = (value: string) => {
    const ms = Date.parse(value);
    return Number.isFinite(ms)
      ? `${Math.floor(ms / 1000)}:${(/\.(\d+)/.exec(value)?.[1] ?? "").replace(/0+$/, "")}`
      : null;
  };
  const first = key(a);
  return first !== null && first === key(b);
}
const milestoneId = z.string().min(1).max(80);
const unique = (values: string[]) => new Set(values).size === values.length;
export const learningPathSchema = z.object({
  id: uuid,
  slug: z.string().min(1),
  title: z.string().refine((value) => value.trim().length > 0),
  description: z.string().nullable(),
  category: z.string().nullable(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  estimated_hours: integer.nonnegative(),
  milestones: z
    .array(
      z.object({
        id: milestoneId,
        title: z.string().refine((value) => value.trim().length > 0),
      }),
    )
    .refine((items) => unique(items.map((item) => item.id)), "Duplicate milestone IDs."),
  recommended_for: z.array(z.string()),
  created_at: learningTimestamp,
});
export type LearningPath = z.infer<typeof learningPathSchema>;
export const learningBrowseSchema = z
  .object({ page: z.number().int().min(1).max(100_000).default(1) })
  .strict();
export type LearningBrowse = z.infer<typeof learningBrowseSchema>;
export const learningPageSchema = z
  .object({
    page: z.number().int().min(1).max(100_000),
    pageSize: z.literal(LEARNING_PAGE_SIZE),
    total: integer.nonnegative(),
    items: z.array(learningPathSchema).max(LEARNING_PAGE_SIZE),
    checkedAt: learningTimestamp,
  })
  .strict()
  .refine(
    (page) =>
      page.items.length ===
        Math.min(
          LEARNING_PAGE_SIZE,
          Math.max(0, page.total - (page.page - 1) * LEARNING_PAGE_SIZE),
        ) && unique(page.items.map((item) => item.id)),
    "Catalog rows and exact count do not match.",
  );
export type LearningPage = z.infer<typeof learningPageSchema>;
export function confirmLearningPage(value: unknown, input: LearningBrowse) {
  const page = learningPageSchema.parse(value);
  if (page.page !== input.page) throw new Error("Requested learning catalog page not confirmed.");
  return page;
}
export const learningProgressSchema = z.object({
  id: uuid,
  user_id: uuid,
  workspace_id: uuid.nullable(),
  path_id: uuid,
  // Preserve legacy IDs as-is. Unknown IDs are displayed, not counted or deleted.
  completed_milestones: z.array(z.string()).refine(unique, "Duplicate completed IDs."),
  progress_pct: integer,
  started_at: learningTimestamp,
  completed_at: learningTimestamp.nullable(),
  updated_at: learningTimestamp,
});
export type LearningProgress = z.infer<typeof learningProgressSchema>;
export function confirmLearningProgress(value: unknown, userId: string, pathId: string) {
  if (value === null) return null;
  const row = learningProgressSchema.parse(value);
  if (row.user_id !== userId || row.path_id !== pathId)
    throw new Error("Personal learning progress owner or path not confirmed.");
  return row;
}
export const learningProgressInputSchema = z
  .object({ accountId: uuid, pathIds: z.array(uuid).min(1).max(LEARNING_PAGE_SIZE).refine(unique) })
  .strict();
export type LearningProgressInput = z.infer<typeof learningProgressInputSchema>;
const progressBatchSchema = z
  .object({
    userId: uuid,
    pathIds: z.array(uuid).min(1).max(LEARNING_PAGE_SIZE).refine(unique),
    items: z.array(learningProgressSchema).max(LEARNING_PAGE_SIZE),
    total: integer.nonnegative(),
    checkedAt: learningTimestamp,
  })
  .strict();
export type LearningProgressBatch = z.infer<typeof progressBatchSchema>;
export function confirmLearningProgressBatch(
  value: unknown,
  input: LearningProgressInput,
  userId: string,
) {
  const batch = progressBatchSchema.parse(value);
  if (
    input.accountId !== userId ||
    batch.userId !== userId ||
    JSON.stringify(batch.pathIds) !== JSON.stringify(input.pathIds) ||
    batch.total !== batch.items.length ||
    !unique(batch.items.map((row) => row.path_id)) ||
    !unique(batch.items.map((row) => row.id)) ||
    batch.items.some((row) => row.user_id !== userId || !input.pathIds.includes(row.path_id))
  )
    throw new Error("Complete personal learning progress batch not confirmed.");
  return batch;
}
export function learningProgressFor(batch: LearningProgressBatch, pathId: string) {
  if (!batch.pathIds.includes(pathId)) throw new Error("Path not included in confirmed read.");
  return batch.items.find((row) => row.path_id === pathId) ?? null;
}
/** Content comparison token, not a cryptographic or transactional catalog version. */
export function learningCatalogVersion(path: LearningPath) {
  return JSON.stringify([
    path.id,
    path.slug,
    path.title,
    path.description,
    path.category,
    path.difficulty,
    path.estimated_hours,
    path.milestones.map((item) => [item.id, item.title]),
    path.recommended_for,
    path.created_at,
  ]);
}
export function learningProgressEqual(a: LearningProgress | null, b: LearningProgress | null) {
  if (a === null || b === null) return a === b;
  return (
    a.id === b.id &&
    a.user_id === b.user_id &&
    a.path_id === b.path_id &&
    a.workspace_id === b.workspace_id &&
    a.progress_pct === b.progress_pct &&
    JSON.stringify(a.completed_milestones) === JSON.stringify(b.completed_milestones) &&
    learningSameInstant(a.started_at, b.started_at) &&
    learningSameInstant(a.updated_at, b.updated_at) &&
    (a.completed_at === null || b.completed_at === null
      ? a.completed_at === b.completed_at
      : learningSameInstant(a.completed_at, b.completed_at))
  );
}
export function learningCounts(
  path: LearningPath,
  row: Pick<LearningProgress, "completed_milestones"> | null,
) {
  const completed = row?.completed_milestones ?? [];
  const known = path.milestones.filter((milestone) => completed.includes(milestone.id)).length;
  const unknown = completed.filter((id) => !path.milestones.some((item) => item.id === id));
  return {
    known,
    total: path.milestones.length,
    percent: path.milestones.length ? Math.round((known / path.milestones.length) * 100) : 0,
    unknown,
  };
}
export const learningSetInputSchema = z
  .object({
    accountId: uuid,
    pathId: uuid,
    milestoneId,
    completed: z.boolean(),
    expectedCatalog: z.string().min(1).max(200_000),
    expectedProgress: learningProgressSchema.nullable(),
    operationId: uuid,
  })
  .strict();
export type LearningSetInput = z.infer<typeof learningSetInputSchema>;
export function learningChange(input: LearningSetInput, path: LearningPath, userId: string) {
  if (
    path.id !== input.pathId ||
    learningCatalogVersion(path) !== input.expectedCatalog ||
    !path.milestones.some((item) => item.id === input.milestoneId)
  )
    throw new Error("Learning catalog changed or milestone not found. Read and review again.");
  if (input.accountId !== userId)
    throw new Error("Learning account changed. Sign in and read again.");
  const before = confirmLearningProgress(input.expectedProgress, userId, input.pathId);
  const completed = before?.completed_milestones ?? [];
  const changed = completed.includes(input.milestoneId) !== input.completed;
  const next = !changed
    ? [...completed]
    : input.completed
      ? [...completed, input.milestoneId]
      : completed.filter((id) => id !== input.milestoneId);
  const counts = learningCounts(path, { completed_milestones: next });
  return {
    changed,
    before,
    next,
    counts,
    mode: !changed ? ("unchanged" as const) : before ? ("updated" as const) : ("created" as const),
  };
}
const learningReceiptSchema = z
  .object({
    operationId: uuid,
    pathId: uuid,
    catalogVersion: z.string(),
    mode: z.enum(["created", "updated", "unchanged"]),
    recordedAt: learningTimestamp.nullable(),
    progress: learningProgressSchema.nullable(),
  })
  .strict();
export type LearningReceipt = z.infer<typeof learningReceiptSchema>;
export function confirmLearningReceipt(
  value: unknown,
  input: LearningSetInput,
  path: LearningPath,
  userId: string,
  recordedAt?: string,
) {
  const receipt = learningReceiptSchema.parse(value);
  const change = learningChange(input, path, userId);
  const row = confirmLearningProgress(receipt.progress, userId, input.pathId);
  if (
    receipt.operationId !== input.operationId ||
    receipt.pathId !== input.pathId ||
    receipt.catalogVersion !== input.expectedCatalog ||
    receipt.mode !== change.mode
  )
    throw new Error("Learning operation receipt not confirmed.");
  if (!change.changed) {
    if (receipt.recordedAt !== null || !learningProgressEqual(row, change.before))
      throw new Error("Unchanged learning read not confirmed.");
    return receipt;
  }
  if (
    !row ||
    !receipt.recordedAt ||
    (recordedAt !== undefined && !learningSameInstant(receipt.recordedAt, recordedAt)) ||
    JSON.stringify(row.completed_milestones) !== JSON.stringify(change.next) ||
    row.progress_pct !== change.counts.percent ||
    (change.counts.total > 0 && change.counts.known === change.counts.total
      ? row.completed_at === null || !learningSameInstant(row.completed_at, receipt.recordedAt)
      : row.completed_at !== null)
  )
    throw new Error("Saved learning state not confirmed.");
  if (change.before) {
    if (
      row.id !== change.before.id ||
      row.workspace_id !== change.before.workspace_id ||
      !learningSameInstant(row.started_at, change.before.started_at) ||
      learningSameInstant(row.updated_at, change.before.updated_at)
    )
      throw new Error("Updated personal learning version not confirmed.");
  } else if (
    row.id !== input.operationId ||
    row.workspace_id !== null ||
    !learningSameInstant(row.started_at, receipt.recordedAt) ||
    !learningSameInstant(row.updated_at, receipt.recordedAt)
  )
    throw new Error("Created personal learning version not confirmed.");
  return receipt;
}
