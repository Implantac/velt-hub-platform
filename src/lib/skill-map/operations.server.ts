import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireWorkspaceRole } from "@/lib/api/_workspace";
import { throwIfError } from "@/lib/api/_supabase";
import {
  SKILL_MEMBER_ROLES,
  confirmSkillAccount,
  confirmSkillAssessment,
  confirmSkillReceipt,
  skillAssessmentEqual,
  skillChange,
  skillSameInstant,
  skillSetInputSchema,
  type SkillScope,
} from "./contracts";

export async function requireSkillScope(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: SkillScope,
) {
  confirmSkillAccount(input, userId);
  return requireWorkspaceRole(supabase, input.workspaceId, userId, SKILL_MEMBER_ROLES);
}
/** One current personal row per area. No UPSERT, append-history fiction, Brain event or cache/database side effect. */
export async function recordSkillAssessment(
  supabase: SupabaseClient<Database>,
  userId: string,
  raw: unknown,
) {
  const input = skillSetInputSchema.parse(raw),
    change = skillChange(input, userId);
  await requireSkillScope(supabase, userId, input);
  const result = await supabase
    .from("skill_assessments")
    .select("*")
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", userId)
    .eq("area", input.area)
    .maybeSingle();
  throwIfError(result.error);
  const current = confirmSkillAssessment(result.data, input, userId, input.area);
  if (!skillAssessmentEqual(current, change.before))
    throw new Error("Skill Map assessment changed. Read and review the current record.");
  const recordedAt = change.changed ? new Date().toISOString() : null;
  if (recordedAt && current && skillSameInstant(recordedAt, current.assessed_at))
    throw new Error("Skill Map version did not change. No write attempted; read and review again.");
  let assessment: unknown = current;
  if (change.changed) {
    // Narrows membership-revocation races; not an atomic lock or a change to existing RLS.
    await requireSkillScope(supabase, userId, input);
    const saved = current
      ? await supabase
          .from("skill_assessments")
          .update({
            score: input.score,
            notes: input.notes,
            source: "self",
            assessed_at: recordedAt!,
          })
          .eq("id", current.id)
          .eq("user_id", userId)
          .eq("workspace_id", input.workspaceId)
          .eq("area", input.area)
          .eq("assessed_at", current.assessed_at)
          .select()
          .single()
      : await supabase
          .from("skill_assessments")
          .insert({
            id: input.operationId,
            user_id: userId,
            workspace_id: input.workspaceId,
            area: input.area,
            score: input.score,
            notes: input.notes,
            source: "self",
            confidence: 0.5,
            evidence: {},
            assessed_at: recordedAt!,
          })
          .select()
          .single();
    throwIfError(saved.error);
    assessment = saved.data;
  }
  return confirmSkillReceipt(
    {
      operationId: input.operationId,
      accountId: userId,
      workspaceId: input.workspaceId,
      area: input.area,
      mode: change.mode,
      recordedAt,
      assessment,
    },
    input,
    userId,
    recordedAt ?? undefined,
  );
}
