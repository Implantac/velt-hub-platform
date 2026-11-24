import { type DiagnosticComputeInput, type HealthRecord, type ScoreRecord } from "../contracts";
import {
  calculateDiagnostics,
  DIAGNOSTIC_FALLBACK_MESSAGES,
  type DiagnosticEvidence,
} from "../model";

export const id = (value: number) => `20000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
export const workspaceId = id(1);
export const otherWorkspace = id(2);
export const userId = id(3);
export const at = "2026-11-12T15:00:00.123Z";
export const input: DiagnosticComputeInput = { workspaceId, calculationId: id(4) };
export const baseRow = (value: number) => ({ id: id(value), workspace_id: workspaceId });
export function evidence(): DiagnosticEvidence {
  return {
    brands: {
      data: [
        {
          ...baseRow(10),
          voice: { tone: "Clear" },
          palette: { primary: "#fff" },
          logo_url: "/brand.svg",
        },
      ],
      count: 1,
      error: null,
    },
    channels: {
      data: Array.from({ length: 3 }, (_, index) => ({
        ...baseRow(20 + index),
        status: index < 2 ? "connected" : "disconnected",
        authorization_issue: null,
        oauth_revoked_at: null,
      })),
      count: 3,
      error: null,
    },
    content: {
      data: [30, 31].map((value) => ({ ...baseRow(value), created_at: at })),
      count: 2,
      error: null,
    },
    jobs: {
      data: [
        {
          ...baseRow(40),
          status: "succeeded",
          external_post_id: "real-ref",
          reconcile_state: "confirmed",
          scheduled_at: at,
        },
        {
          ...baseRow(41),
          status: "failed",
          external_post_id: null,
          reconcile_state: "none",
          scheduled_at: at,
        },
        {
          ...baseRow(42),
          status: "pending",
          external_post_id: null,
          reconcile_state: "none",
          scheduled_at: at,
        },
      ],
      count: 3,
      error: null,
    },
  };
}
export function calculation() {
  return calculateDiagnostics(evidence(), input, at, at);
}
export function scoreRecord(): ScoreRecord {
  const value = calculation();
  return {
    id: input.calculationId,
    workspace_id: workspaceId,
    computed_at: at,
    ...value.scores,
    breakdown: {
      diagnostic: value.diagnostic,
      gapCodes: value.gapCodes,
      gaps: value.gapCodes.map((code) => DIAGNOSTIC_FALLBACK_MESSAGES[code]),
    },
  };
}
export function healthRecords(): HealthRecord[] {
  const value = calculation();
  return value.cards.map((card, index) => ({
    id: id(100 + index),
    workspace_id: workspaceId,
    computed_at: at,
    category: card.category,
    score: card.score,
    strengths: card.strengthCodes.map((code) => DIAGNOSTIC_FALLBACK_MESSAGES[code]),
    weaknesses: card.weaknessCodes.map((code) => DIAGNOSTIC_FALLBACK_MESSAGES[code]),
    details: {
      diagnostic: value.diagnostic,
      strengthCodes: card.strengthCodes,
      weaknessCodes: card.weaknessCodes,
    },
  }));
}
