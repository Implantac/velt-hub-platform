import { z } from "zod";
import { diagnosticMetaSchema, type DiagnosticMessage } from "@/lib/diagnostics/contracts";
import {
  COACH_MODEL,
  COACH_RULE_CODES,
  COACH_RULES,
  confirmCoachRecord,
  type CoachGenerateInput,
} from "./contracts";

/** Explainable suggestions only. No history mutation, network, memory personalization, scores or AI writes. */
export function coachRecommendations(
  calculation: {
    diagnostic: z.infer<typeof diagnosticMetaSchema>;
    gapCodes: readonly DiagnosticMessage[];
  },
  input: CoachGenerateInput,
  userId: string,
  nextId: () => string,
) {
  const evidence = diagnosticMetaSchema.parse(calculation.diagnostic);
  if (evidence.calculationId !== input.batchId)
    throw new Error("Coach evidence is for a different batch.");
  const rawCodes = calculation.gapCodes.length ? calculation.gapCodes : ["reviewBaseline"];
  const codes = z.array(z.enum(COACH_RULE_CODES)).min(1).max(8).parse(rawCodes);
  if (new Set(codes).size !== codes.length) throw new Error("Duplicate Coach rule in the batch.");
  const rows = codes.map((code) => {
    const rule = COACH_RULES[code];
    return confirmCoachRecord(
      {
        id: nextId(),
        workspace_id: input.workspaceId,
        user_id: userId,
        kind: rule.kind,
        severity: rule.severity,
        score: rule.score,
        title: rule.title,
        body: rule.body,
        cta: { href: rule.href, label: rule.label, coach: { model: COACH_MODEL, code, evidence } },
        created_at: evidence.finishedAt,
        updated_at: evidence.finishedAt,
        completed_at: null,
        dismissed_at: null,
      },
      input.workspaceId,
    );
  });
  if (new Set(rows.map((row) => row.id)).size !== rows.length)
    throw new Error("Duplicate Coach recommendation ID in the batch.");
  return rows;
}
