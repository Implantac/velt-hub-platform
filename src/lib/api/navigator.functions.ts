import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  confirmNavigatorProfile,
  confirmNavigatorReceipt,
  navigatorSaveInputSchema,
} from "@/lib/navigator/contracts";
import { navigatorProfilePayload } from "@/lib/navigator/model";
import { throwIfError } from "./_supabase";

/** Personal, not workspace-scoped. Authenticated users read only their own row. */
export const getDigitalProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context: { supabase, userId } }) => {
    const result = await supabase
      .from("user_profile_digital")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    throwIfError(result.error);
    return confirmNavigatorProfile(result.data, userId);
  });

/** Explicit personal questionnaire save. Never upserts or changes onboarding/workspace state. */
export const saveDigitalProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => navigatorSaveInputSchema.parse(input))
  .handler(async ({ data, context: { supabase, userId } }) => {
    const savedAt = new Date().toISOString();
    const payload = {
      user_id: userId,
      ...navigatorProfilePayload(data.answers, data.revisionId, savedAt),
    };
    const mode = data.expectedUpdatedAt === null ? "created" : "updated";
    const query =
      mode === "created"
        ? supabase
            .from("user_profile_digital")
            .insert({ ...payload, created_at: savedAt, updated_at: savedAt })
        : supabase
            .from("user_profile_digital")
            .update(payload)
            .eq("user_id", userId)
            .eq("updated_at", data.expectedUpdatedAt!);
    const result = await query.select("*").single();
    throwIfError(result.error);
    return confirmNavigatorReceipt({ profile: result.data, mode }, data, userId, savedAt);
  });
