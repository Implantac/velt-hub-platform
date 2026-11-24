import {
  learningCatalogVersion,
  learningChange,
  type LearningPage,
  type LearningPath,
  type LearningProgress,
  type LearningProgressBatch,
  type LearningSetInput,
} from "../contracts";
export const uid = "10000000-0000-4000-8000-000000000001";
export const otherUser = "10000000-0000-4000-8000-000000000002";
export const pid = "20000000-0000-4000-8000-000000000001";
export const otherPath = "20000000-0000-4000-8000-000000000002";
export const operationId = "30000000-0000-4000-8000-000000000001";
export const recordId = "40000000-0000-4000-8000-000000000001";
export const workspaceId = "50000000-0000-4000-8000-000000000001";
export const at = "2026-11-12T15:00:00.000Z";
export const earlier = "2026-11-12T14:00:00.123456+00:00";
export const learningPath = (patch: Partial<LearningPath> = {}): LearningPath => ({
  id: pid,
  slug: "original-path",
  title: "Catálogo original",
  description: "Descrição original, não promessa.",
  category: "content",
  difficulty: "beginner",
  estimated_hours: 0,
  milestones: [
    { id: "first", title: "Primeiro marco" },
    { id: "second", title: "Segundo marco" },
  ],
  recommended_for: ["content_creator"],
  created_at: earlier,
  ...patch,
});
export const progress = (patch: Partial<LearningProgress> = {}): LearningProgress => ({
  id: recordId,
  user_id: uid,
  path_id: pid,
  workspace_id: workspaceId,
  completed_milestones: ["first", "legacy-original"],
  progress_pct: 175,
  started_at: earlier,
  updated_at: earlier,
  completed_at: null,
  ...patch,
});
export const page = (patch: Partial<LearningPage> = {}): LearningPage => ({
  page: 1,
  pageSize: 20,
  total: 1,
  items: [learningPath()],
  checkedAt: at,
  ...patch,
});
export const batch = (patch: Partial<LearningProgressBatch> = {}): LearningProgressBatch => ({
  userId: uid,
  pathIds: [pid],
  items: [progress()],
  total: 1,
  checkedAt: at,
  ...patch,
});
export const input = (patch: Partial<LearningSetInput> = {}): LearningSetInput => ({
  accountId: uid,
  pathId: pid,
  milestoneId: "second",
  completed: true,
  expectedCatalog: learningCatalogVersion(learningPath()),
  expectedProgress: progress(),
  operationId,
  ...patch,
});
export function receipt(request = input(), path = learningPath()) {
  const change = learningChange(request, path, uid);
  const row = !change.changed
    ? change.before
    : {
        ...(change.before ?? {
          id: request.operationId,
          user_id: uid,
          path_id: request.pathId,
          workspace_id: null,
          started_at: at,
        }),
        completed_milestones: change.next,
        progress_pct: change.counts.percent,
        completed_at:
          change.counts.total > 0 && change.counts.known === change.counts.total ? at : null,
        updated_at: at,
      };
  return {
    operationId: request.operationId,
    pathId: request.pathId,
    catalogVersion: request.expectedCatalog,
    mode: change.mode,
    recordedAt: change.changed ? at : null,
    progress: row,
  };
}
