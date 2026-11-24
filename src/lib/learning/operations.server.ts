import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { throwIfError } from "@/lib/api/_supabase";
import {
  confirmLearningProgress,
  confirmLearningReceipt,
  learningChange,
  learningPathSchema,
  learningProgressEqual,
  type LearningSetInput,
} from "./contracts";

/** Personal command, not a toggle. No workspace writes, UPSERT, hidden side effects or retries. */
export async function recordLearningMilestone(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: LearningSetInput,
) {
  if (input.accountId !== userId) throw new Error("Learning account changed. No write attempted.");
  confirmLearningProgress(input.expectedProgress, userId, input.pathId);
  const catalog = await supabase
    .from("learning_paths")
    .select("*")
    .eq("id", input.pathId)
    .maybeSingle();
  throwIfError(catalog.error);
  const path = learningPathSchema.parse(catalog.data);
  const change = learningChange(input, path, userId);
  const observed = await supabase
    .from("learning_path_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("path_id", input.pathId)
    .maybeSingle();
  throwIfError(observed.error);
  const current = confirmLearningProgress(observed.data, userId, input.pathId);
  if (!learningProgressEqual(current, change.before))
    throw new Error("Personal learning progress changed. Read and review before another action.");
  const receipt = {
    operationId: input.operationId,
    pathId: input.pathId,
    catalogVersion: input.expectedCatalog,
    mode: change.mode,
  };
  if (!change.changed)
    return confirmLearningReceipt(
      { ...receipt, recordedAt: null, progress: current },
      input,
      path,
      userId,
    );
  const recordedAt = new Date().toISOString();
  const patch = {
    completed_milestones: change.next,
    progress_pct: change.counts.percent,
    completed_at: change.counts.known === change.counts.total ? recordedAt : null,
  };
  const query = current
    ? supabase
        .from("learning_path_progress")
        .update(patch)
        .eq("user_id", userId)
        .eq("path_id", input.pathId)
        .eq("id", current.id)
        .eq("updated_at", input.expectedProgress!.updated_at)
    : supabase.from("learning_path_progress").insert({
        ...patch,
        id: input.operationId,
        user_id: userId,
        path_id: input.pathId,
        workspace_id: null,
        started_at: recordedAt,
        updated_at: recordedAt,
      });
  const saved = await query.select("*").single();
  throwIfError(saved.error);
  return confirmLearningReceipt(
    { ...receipt, recordedAt, progress: saved.data },
    input,
    path,
    userId,
    recordedAt,
  );
}
