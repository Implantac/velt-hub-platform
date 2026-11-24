import { z } from "zod";

export const SKILL_AREAS = [
  "copy",
  "content",
  "product",
  "sales",
  "branding",
  "analytics",
  "automation",
  "prospecting",
  "community",
  "strategy",
] as const;
export type SkillArea = (typeof SKILL_AREAS)[number];
export const SKILL_MEMBER_ROLES = ["owner", "admin", "editor", "viewer"] as const;
export const SKILL_METHOD = "velt-skill-map-self-v1";
const uuid = z.string().uuid();
export const skillTimestamp = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)));
export function skillSameInstant(a: string, b: string) {
  const key = (value: string) => {
    const time = Date.parse(value);
    return Number.isFinite(time)
      ? `${Math.floor(time / 1000)}:${(/\.(\d+)/.exec(value)?.[1] ?? "").replace(/0+$/, "")}`
      : null;
  };
  const first = key(a);
  return first !== null && first === key(b);
}
export type SkillJson =
  null | boolean | number | string | SkillJson[] | { [key: string]: SkillJson };
/** Bound, validate and preserve legacy JSON; never truncate, execute or interpret it as proof. */
export function isSkillJson(value: unknown): value is SkillJson {
  let nodes = 0,
    characters = 0;
  const visit = (item: unknown, depth: number): boolean => {
    if (++nodes > 8_000 || depth > 24) return false;
    if (typeof item === "string") {
      characters += item.length;
      return characters <= 65_536;
    }
    if (item === null || typeof item === "boolean") return true;
    if (typeof item === "number") return Number.isFinite(item);
    if (Array.isArray(item)) return Array.from(item).every((entry) => visit(entry, depth + 1));
    if (
      typeof item !== "object" ||
      (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) ||
      Object.getOwnPropertySymbols(item).length
    )
      return false;
    characters += Object.keys(item).reduce((sum, key) => sum + key.length, 0);
    return characters <= 65_536 && Object.values(item).every((entry) => visit(entry, depth + 1));
  };
  try {
    return visit(value, 0) && JSON.stringify(value).length <= 65_536;
  } catch {
    return false;
  }
}
export function skillJsonToken(value: SkillJson): string {
  if (Array.isArray(value)) return `[${value.map(skillJsonToken).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${skillJsonToken(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
const evidence = z.custom<SkillJson>(isSkillJson, "Invalid or excessive original evidence JSON.");
export const skillAssessmentSchema = z
  .object({
    id: uuid,
    user_id: uuid,
    workspace_id: uuid,
    area: z.enum(SKILL_AREAS),
    score: z.number().int().min(0).max(100),
    // Historical technical values are not a calibrated confidence measurement.
    confidence: z.number().finite(),
    source: z.string().max(2_000),
    notes: z.string().max(50_000).nullable(),
    evidence,
    assessed_at: skillTimestamp,
  })
  .strict();
export type SkillAssessment = z.infer<typeof skillAssessmentSchema>;
export const skillScopeSchema = z.object({ accountId: uuid, workspaceId: uuid }).strict();
export type SkillScope = z.infer<typeof skillScopeSchema>;
export function confirmSkillAccount(input: SkillScope, userId: string) {
  if (input.accountId !== userId) throw new Error("Skill Map account changed. No query attempted.");
}
export function confirmSkillAssessment(
  value: unknown,
  input: SkillScope,
  userId: string,
  area: SkillArea,
) {
  confirmSkillAccount(input, userId);
  if (value === null) return null;
  const row = skillAssessmentSchema.parse(value);
  if (row.user_id !== userId || row.workspace_id !== input.workspaceId || row.area !== area)
    throw new Error("Personal Skill Map record scope not confirmed.");
  return row;
}
const skillSnapshotSchema = z
  .object({
    accountId: uuid,
    workspaceId: uuid,
    total: z.number().int().min(0).max(SKILL_AREAS.length),
    items: z.array(skillAssessmentSchema).max(SKILL_AREAS.length),
    checkedAt: skillTimestamp,
  })
  .strict();
export type SkillSnapshot = z.infer<typeof skillSnapshotSchema>;
export function confirmSkillSnapshot(value: unknown, input: SkillScope, userId: string) {
  confirmSkillAccount(input, userId);
  const snapshot = skillSnapshotSchema.parse(value);
  if (
    snapshot.accountId !== userId ||
    snapshot.workspaceId !== input.workspaceId ||
    snapshot.total !== snapshot.items.length ||
    new Set(snapshot.items.map((row) => row.area)).size !== snapshot.items.length ||
    new Set(snapshot.items.map((row) => row.id)).size !== snapshot.items.length ||
    snapshot.items.some((row) => row.user_id !== userId || row.workspace_id !== input.workspaceId)
  )
    throw new Error("Complete personal Skill Map read not confirmed.");
  return snapshot;
}
export function skillAssessmentFor(snapshot: SkillSnapshot, area: SkillArea) {
  if (!SKILL_AREAS.includes(area)) throw new Error("Unknown Skill Map area.");
  return snapshot.items.find((row) => row.area === area) ?? null;
}
export function skillAssessmentEqual(a: SkillAssessment | null, b: SkillAssessment | null) {
  if (a === null || b === null) return a === b;
  return (
    a.id === b.id &&
    a.user_id === b.user_id &&
    a.workspace_id === b.workspace_id &&
    a.area === b.area &&
    a.score === b.score &&
    a.notes === b.notes &&
    a.source === b.source &&
    a.confidence === b.confidence &&
    skillJsonToken(a.evidence) === skillJsonToken(b.evidence) &&
    skillSameInstant(a.assessed_at, b.assessed_at)
  );
}
export const skillSetInputSchema = z
  .object({
    accountId: uuid,
    workspaceId: uuid,
    area: z.enum(SKILL_AREAS),
    score: z.number().int().min(0).max(100),
    notes: z.string().max(500).nullable(),
    expected: skillAssessmentSchema.nullable(),
    operationId: uuid,
  })
  .strict();
export type SkillSetInput = z.infer<typeof skillSetInputSchema>;
export function skillChange(input: SkillSetInput, userId: string) {
  const before = confirmSkillAssessment(input.expected, input, userId, input.area);
  const changed =
    before === null ||
    before.score !== input.score ||
    before.notes !== input.notes ||
    before.source !== "self";
  return {
    before,
    changed,
    mode: !changed ? ("unchanged" as const) : before ? ("updated" as const) : ("created" as const),
  };
}
const skillReceiptSchema = z
  .object({
    operationId: uuid,
    accountId: uuid,
    workspaceId: uuid,
    area: z.enum(SKILL_AREAS),
    mode: z.enum(["created", "updated", "unchanged"]),
    recordedAt: skillTimestamp.nullable(),
    assessment: skillAssessmentSchema,
  })
  .strict();
export type SkillReceipt = z.infer<typeof skillReceiptSchema>;
export function confirmSkillReceipt(
  value: unknown,
  input: SkillSetInput,
  userId: string,
  recordedAt?: string,
) {
  const result = skillReceiptSchema.parse(value),
    change = skillChange(input, userId);
  const row = confirmSkillAssessment(result.assessment, input, userId, input.area)!;
  if (
    result.operationId !== input.operationId ||
    result.accountId !== userId ||
    result.workspaceId !== input.workspaceId ||
    result.area !== input.area ||
    result.mode !== change.mode
  )
    throw new Error("Skill Map operation receipt not confirmed.");
  if (!change.changed) {
    if (result.recordedAt !== null || !skillAssessmentEqual(row, change.before))
      throw new Error("Unchanged Skill Map state not confirmed.");
    return result;
  }
  if (
    !result.recordedAt ||
    (recordedAt !== undefined && !skillSameInstant(result.recordedAt, recordedAt)) ||
    !skillSameInstant(row.assessed_at, result.recordedAt) ||
    row.score !== input.score ||
    row.notes !== input.notes ||
    row.source !== "self"
  )
    throw new Error("Saved Skill Map assessment not confirmed.");
  if (change.before) {
    if (
      row.id !== change.before.id ||
      row.confidence !== change.before.confidence ||
      skillJsonToken(row.evidence) !== skillJsonToken(change.before.evidence) ||
      skillSameInstant(row.assessed_at, change.before.assessed_at)
    )
      throw new Error("Updated Skill Map version or preserved metadata not confirmed.");
  } else if (
    row.id !== input.operationId ||
    row.confidence !== 0.5 ||
    skillJsonToken(row.evidence) !== "{}"
  )
    throw new Error("Created Skill Map assessment not confirmed.");
  return result;
}
