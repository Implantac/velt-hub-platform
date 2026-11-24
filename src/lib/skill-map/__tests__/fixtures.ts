import {
  skillChange,
  type SkillAssessment,
  type SkillSetInput,
  type SkillSnapshot,
} from "../contracts";
export const uid = "00000000-0000-4000-8000-000000000021",
  otherUser = "00000000-0000-4000-8000-000000000022";
export const workspaceId = "10000000-0000-4000-8000-000000000001",
  otherWorkspace = "10000000-0000-4000-8000-000000000002";
export const recordId = "30000000-0000-4000-8000-000000000001",
  operationId = "40000000-0000-4000-8000-000000000001";
export const at = "2026-11-12T15:04:05.123Z",
  earlier = "2026-11-10T23:30:00.123456Z";
export const scope = () => ({ accountId: uid, workspaceId });
export const assessment = (patch: Partial<SkillAssessment> = {}): SkillAssessment => ({
  id: recordId,
  user_id: uid,
  workspace_id: workspaceId,
  area: "copy",
  score: 45,
  confidence: 0.6,
  source: "self",
  notes: " Texto original \n",
  evidence: { legado: ["original", 0, false, null], external: "javascript:alert(1)" },
  assessed_at: earlier,
  ...patch,
});
export const snapshot = (patch: Partial<SkillSnapshot> = {}): SkillSnapshot => ({
  ...scope(),
  total: 1,
  items: [assessment()],
  checkedAt: at,
  ...patch,
});
export const input = (patch: Partial<SkillSetInput> = {}): SkillSetInput => ({
  ...scope(),
  area: "copy",
  score: 0,
  notes: null,
  expected: assessment(),
  operationId,
  ...patch,
});
export function receipt(request = input()) {
  const change = skillChange(request, uid);
  const row = !change.changed
    ? change.before!
    : {
        ...(change.before ?? {
          id: request.operationId,
          user_id: uid,
          workspace_id: request.workspaceId,
          area: request.area,
          confidence: 0.5,
          evidence: {},
        }),
        score: request.score,
        notes: request.notes,
        source: "self",
        assessed_at: at,
      };
  return {
    ...scope(),
    operationId: request.operationId,
    area: request.area,
    mode: change.mode,
    recordedAt: change.changed ? at : null,
    assessment: row,
  };
}
