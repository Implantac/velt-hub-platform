import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DIAGNOSTIC_LIMIT, type DiagnosticComputeInput } from "./contracts";
import { calculateDiagnostics } from "./model";

/** Bounded, scoped reads only. No service role, provider, AI or shared Brain generation. */
export async function buildDiagnostics(
  supabase: SupabaseClient<Database>,
  input: DiagnosticComputeInput,
) {
  const startedAt = new Date().toISOString();
  const [brands, channels, content, jobs] = await Promise.all([
    supabase
      .from("brands")
      .select("id, workspace_id, voice, palette, logo_url", { count: "exact" })
      .eq("workspace_id", input.workspaceId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(DIAGNOSTIC_LIMIT),
    supabase
      .from("channels")
      .select("id, workspace_id, status, authorization_issue, oauth_revoked_at", { count: "exact" })
      .eq("workspace_id", input.workspaceId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(DIAGNOSTIC_LIMIT),
    supabase
      .from("content")
      .select("id, workspace_id, created_at", { count: "exact" })
      .eq("workspace_id", input.workspaceId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(DIAGNOSTIC_LIMIT),
    supabase
      .from("scheduler_jobs")
      .select("id, workspace_id, status, scheduled_at, external_post_id, reconcile_state", {
        count: "exact",
      })
      .eq("workspace_id", input.workspaceId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(DIAGNOSTIC_LIMIT),
  ]);
  return calculateDiagnostics(
    { brands, channels, content, jobs },
    input,
    startedAt,
    new Date().toISOString(),
  );
}
