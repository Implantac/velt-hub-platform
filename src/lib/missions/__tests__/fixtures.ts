import {
  MISSION_PAGE_SIZE,
  MISSION_STATUSES,
  type MissionPage,
  type MissionRecord,
} from "../contracts";

export const workspaceId = "10000000-0000-4000-8000-000000000001";
export const userId = "10000000-0000-4000-8000-000000000002";
export const at = "2026-11-12T15:00:00.123456+00:00";
export const later = "2026-11-12T16:00:00.654321+00:00";
export function mission(index = 0, patch: Partial<MissionRecord> = {}): MissionRecord {
  return {
    id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    workspace_id: workspaceId,
    title: `Review drafts ${index}`,
    description: "A manually reviewed goal",
    status: "pending",
    priority: 0,
    due_at: null,
    created_at: at,
    updated_at: at,
    created_by: userId,
    ...patch,
  };
}
export function page(patch: Partial<MissionPage> = {}): MissionPage {
  const pageNumber = patch.page ?? 1;
  const total = patch.total ?? 1;
  const offset = (pageNumber - 1) * MISSION_PAGE_SIZE;
  const length = Math.min(MISSION_PAGE_SIZE, Math.max(0, total - offset));
  const status = patch.status ?? "all";
  return {
    workspaceId,
    status,
    page: pageNumber,
    pageSize: MISSION_PAGE_SIZE,
    checkedAt: at,
    total,
    items: Array.from({ length }, (_, index) =>
      mission(offset + index, {
        status: status === "all" ? MISSION_STATUSES[index % MISSION_STATUSES.length] : status,
      }),
    ),
    ...patch,
  };
}
