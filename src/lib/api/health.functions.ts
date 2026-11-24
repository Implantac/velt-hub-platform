/** Saved health reads and an explicit, versioned local heuristic calculation. */
import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WORKSPACE_EDIT_ROLES } from "@/lib/workspace/permissions";
import { buildDiagnostics } from "@/lib/diagnostics/build.server";
import { DIAGNOSTIC_FALLBACK_MESSAGES } from "@/lib/diagnostics/model";
import {
  DIAGNOSTIC_READ_ROLES,
  HEALTH_CATEGORIES,
  confirmHealth,
  confirmSavedHealth,
  diagnosticComputeSchema,
  diagnosticScopeSchema,
  type HealthRecord,
} from "@/lib/diagnostics/contracts";
import { throwIfError } from "./_supabase";
import { requireWorkspaceRole } from "./_workspace";

export const computeHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => diagnosticComputeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId, WORKSPACE_EDIT_ROLES);
    const calculation = await buildDiagnostics(supabase, data);
    const expected: HealthRecord[] = calculation.cards.map((card) => ({
      id: randomUUID(),
      workspace_id: data.workspaceId,
      category: card.category,
      score: card.score,
      computed_at: calculation.diagnostic.finishedAt,
      strengths: card.strengthCodes.map((code) => DIAGNOSTIC_FALLBACK_MESSAGES[code]),
      weaknesses: card.weaknessCodes.map((code) => DIAGNOSTIC_FALLBACK_MESSAGES[code]),
      details: {
        diagnostic: calculation.diagnostic,
        strengthCodes: card.strengthCodes,
        weaknessCodes: card.weaknessCodes,
      },
    }));
    const result = await supabase.from("health_metrics").insert(expected).select("*");
    throwIfError(result.error);
    return { metrics: confirmSavedHealth(result.data, expected) };
  });

/** Latest per category; a partial or mixed-age history is not called a single complete run. */
export const getLatestHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => diagnosticScopeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId, DIAGNOSTIC_READ_ROLES);
    const rows = await Promise.all(
      HEALTH_CATEGORIES.map(async (category) => {
        const result = await supabase
          .from("health_metrics")
          .select("*")
          .eq("workspace_id", data.workspaceId)
          .eq("category", category)
          .order("computed_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();
        throwIfError(result.error);
        if (result.data === null) return null;
        // Preserve the previous range error, now with complete row/scope validation too.
        if (
          !result.data ||
          !Number.isInteger(result.data.score) ||
          result.data.score < 0 ||
          result.data.score > 100
        )
          throw new Error("Health score was not returned in its supported range.");
        const [row] = confirmHealth([result.data], data.workspaceId);
        if (row.category !== category)
          throw new Error("The requested health category was not confirmed.");
        return row;
      }),
    );
    return confirmHealth(
      rows.filter((row): row is HealthRecord => row !== null),
      data.workspaceId,
    );
  });
