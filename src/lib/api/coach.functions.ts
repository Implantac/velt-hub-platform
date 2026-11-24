import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WORKSPACE_EDIT_ROLES } from "@/lib/workspace/permissions";
import {
  coachGenerateInputSchema,
  coachListInputSchema,
  coachStatusInputSchema,
  confirmCoachStatus,
  journeyListInputSchema,
} from "@/lib/coach/contracts";
import {
  generateCoachBatch,
  readCoachJourney,
  readCoachRecommendations,
} from "@/lib/coach/operations.server";
import { throwIfError } from "./_supabase";
import { requireWorkspaceRole } from "./_workspace";

export const listRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => coachListInputSchema.parse(input))
  .handler(({ data, context }) => readCoachRecommendations(context.supabase, context.userId, data));

export const listJourney = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => journeyListInputSchema.parse(input))
  .handler(({ data, context }) => readCoachJourney(context.supabase, context.userId, data));

/** Explicit local-rule batch, not AI or a hidden side effect of a read. */
export const generateRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => coachGenerateInputSchema.parse(input))
  .handler(({ data, context }) => generateCoachBatch(context.supabase, context.userId, data));

/** Record manual completion/dismissal only for the exact open version the caller read. */
export const updateRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => coachStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId, WORKSPACE_EDIT_ROLES);
    const recordedAt = new Date().toISOString();
    const patch =
      data.action === "complete" ? { completed_at: recordedAt } : { dismissed_at: recordedAt };
    const result = await supabase
      .from("coach_recommendations")
      .update(patch)
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.id)
      .eq("updated_at", data.expectedUpdatedAt)
      .is("completed_at", null)
      .is("dismissed_at", null)
      .select("*")
      .single();
    throwIfError(result.error);
    return confirmCoachStatus(result.data, data, recordedAt);
  });
