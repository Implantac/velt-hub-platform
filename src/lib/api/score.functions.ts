/** Score is the primary saved result; dashboard mirroring is reported separately. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WORKSPACE_EDIT_ROLES } from "@/lib/workspace/permissions";
import { buildDiagnostics } from "@/lib/diagnostics/build.server";
import { DIAGNOSTIC_FALLBACK_MESSAGES } from "@/lib/diagnostics/model";
import {
  DIAGNOSTIC_READ_ROLES,
  confirmSavedScore,
  confirmScore,
  diagnosticComputeSchema,
  diagnosticScopeSchema,
  type ScoreRecord,
} from "@/lib/diagnostics/contracts";
import { throwIfError } from "./_supabase";
import { requireWorkspaceRole } from "./_workspace";

export const computeDigitalScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => diagnosticComputeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId, WORKSPACE_EDIT_ROLES);
    const calculation = await buildDiagnostics(supabase, data);
    const expected: ScoreRecord = {
      id: data.calculationId,
      workspace_id: data.workspaceId,
      computed_at: calculation.diagnostic.finishedAt,
      ...calculation.scores,
      breakdown: {
        gaps: calculation.gapCodes.map((code) => DIAGNOSTIC_FALLBACK_MESSAGES[code]),
        diagnostic: calculation.diagnostic,
        gapCodes: calculation.gapCodes,
      },
    };
    const primary = await supabase.from("digital_scores").insert(expected).select("*").single();
    throwIfError(primary.error);
    const score = confirmSavedScore(primary.data, expected);

    // No distributed transaction is promised. A failed secondary operation must
    // never turn a confirmed score into a retryable primary write failure.
    let snapshotRecorded = false;
    let answersInvalidated = false;
    try {
      const mirror = await supabase
        .from("brain_snapshots")
        .insert({
          id: data.calculationId,
          workspace_id: data.workspaceId,
          computed_at: calculation.diagnostic.finishedAt,
          snapshot: { source: "diagnostics", diagnostic: calculation.diagnostic },
          scores: calculation.scores,
          signals: [],
        })
        .select("id, workspace_id")
        .single();
      const confirmed = z.object({
        id: z.literal(data.calculationId),
        workspace_id: z.literal(data.workspaceId),
      });
      snapshotRecorded = !mirror.error && confirmed.safeParse(mirror.data).success;
    } catch {
      /* Secondary failure is returned as an explicit warning. */
    }
    if (snapshotRecorded) {
      try {
        const invalidated = await supabase
          .from("brain_answers")
          .delete({ count: "exact" })
          .eq("workspace_id", data.workspaceId)
          .lte("computed_at", calculation.diagnostic.finishedAt);
        answersInvalidated =
          !invalidated.error &&
          z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).safeParse(invalidated.count)
            .success;
      } catch {
        /* Never repeat the primary score to repair a cache. */
      }
    }
    return { score, snapshotRecorded, answersInvalidated };
  });

export const getLatestScore = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => diagnosticScopeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId, DIAGNOSTIC_READ_ROLES);
    const result = await supabase
      .from("digital_scores")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("computed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    throwIfError(result.error);
    return result.data === null ? null : confirmScore(result.data, data.workspaceId);
  });
