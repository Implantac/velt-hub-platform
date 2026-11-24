import {
  calculation,
  at,
  id,
  input as diagnosticInput,
  userId,
  workspaceId,
} from "@/lib/diagnostics/__tests__/fixtures";
import { coachRecommendations } from "../model";
import { type CoachRecord, type JourneyRecord } from "../contracts";
export {
  at,
  id,
  userId,
  workspaceId,
  otherWorkspace,
  evidence,
} from "@/lib/diagnostics/__tests__/fixtures";
export const later = "2026-11-12T15:01:00.456Z";
export const input = { workspaceId, batchId: diagnosticInput.calculationId };
export function recommendations() {
  let next = 100;
  return coachRecommendations(calculation(), input, userId, () => id(next++));
}
export function recommendation(index = 0, patch: Partial<CoachRecord> = {}): CoachRecord {
  return { ...recommendations()[0], id: id(100 + index), ...patch };
}
export function legacy(index = 0, patch: Partial<CoachRecord> = {}): CoachRecord {
  return recommendation(index, {
    title: "Texto original <script>sem execução</script>",
    body: "Promessa legada não verificada.",
    cta: {},
    score: 12.5,
    ...patch,
  });
}
export function journey(index = 0, patch: Partial<JourneyRecord> = {}): JourneyRecord {
  return {
    id: id(600 + index),
    workspace_id: workspaceId,
    user_id: userId,
    kind: "decision",
    subject: "Decisão original <img src=x>",
    payload: {},
    sentiment: null,
    created_at: at,
    ...patch,
  };
}
export function page() {
  return {
    workspaceId,
    status: "open" as const,
    page: 1,
    pageSize: 20 as const,
    total: 4,
    checkedAt: later,
    items: recommendations(),
  };
}
export function journeyPage() {
  return {
    workspaceId,
    page: 1,
    pageSize: 20 as const,
    total: 1,
    checkedAt: later,
    items: [journey()],
  };
}
export function receipt() {
  const rows = recommendations();
  return {
    generated: rows.length,
    recommendations: rows,
    evidence: calculation().diagnostic,
    eventRecorded: true,
  };
}
