import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  SKILL_AREAS,
  confirmSkillSnapshot,
  skillScopeSchema,
  skillSetInputSchema,
} from "@/lib/skill-map/contracts";
import { recordSkillAssessment, requireSkillScope } from "@/lib/skill-map/operations.server";
import { throwIfError } from "./_supabase";

/** Dedicated native Skill Map API. Legacy Brain Lab handlers are unchanged. */
export const getSkillMap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => skillScopeSchema.parse(input))
  .handler(async ({ data, context: { supabase, userId } }) => {
    await requireSkillScope(supabase, userId, data);
    const result = await supabase
      .from("skill_assessments")
      .select("*", { count: "exact" })
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId)
      .order("area", { ascending: true })
      .order("id", { ascending: true })
      .limit(SKILL_AREAS.length);
    throwIfError(result.error);
    return confirmSkillSnapshot(
      { ...data, items: result.data, total: result.count, checkedAt: new Date().toISOString() },
      data,
      userId,
    );
  });
export const saveSkillAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => skillSetInputSchema.parse(input))
  .handler(({ data, context }) => recordSkillAssessment(context.supabase, context.userId, data));
