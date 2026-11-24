import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  LEARNING_PAGE_SIZE,
  confirmLearningPage,
  confirmLearningProgressBatch,
  learningBrowseSchema,
  learningProgressInputSchema,
  learningSetInputSchema,
} from "@/lib/learning/contracts";
import { recordLearningMilestone } from "@/lib/learning/operations.server";
import { throwIfError } from "./_supabase";

/** Authenticated global catalog, with exact total and deterministic page order. GET never writes. */
export const listLearningPaths = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => learningBrowseSchema.parse(input))
  .handler(async ({ data, context: { supabase } }) => {
    const first = (data.page - 1) * LEARNING_PAGE_SIZE;
    const result = await supabase
      .from("learning_paths")
      .select("*", { count: "exact" })
      .order("difficulty", { ascending: true })
      .order("title", { ascending: true })
      .order("id", { ascending: true })
      .range(first, first + LEARNING_PAGE_SIZE - 1);
    throwIfError(result.error);
    return confirmLearningPage(
      {
        ...data,
        pageSize: LEARNING_PAGE_SIZE,
        items: result.data,
        total: result.count,
        checkedAt: new Date().toISOString(),
      },
      data,
    );
  });

/** A complete, bounded batch of the caller's personal rows. Not scoped to a workspace. */
export const listMyProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => learningProgressInputSchema.parse(input))
  .handler(async ({ data, context: { supabase, userId } }) => {
    if (data.accountId !== userId) throw new Error("Learning account changed. No read attempted.");
    const result = await supabase
      .from("learning_path_progress")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .in("path_id", data.pathIds)
      .order("path_id", { ascending: true });
    throwIfError(result.error);
    return confirmLearningProgressBatch(
      {
        userId,
        pathIds: data.pathIds,
        items: result.data,
        total: result.count,
        checkedAt: new Date().toISOString(),
      },
      data,
      userId,
    );
  });

export const setMilestoneCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => learningSetInputSchema.parse(input))
  .handler(({ data, context }) => recordLearningMilestone(context.supabase, context.userId, data));

/** @deprecated Export name retained, but blind legacy toggle inputs now fail closed. Migrate clients. */
export const toggleMilestone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => learningSetInputSchema.parse(input))
  .handler(({ data, context }) => recordLearningMilestone(context.supabase, context.userId, data));
