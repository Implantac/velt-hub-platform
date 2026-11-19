import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WORKSPACE_EDIT_ROLES } from "@/lib/workspace/permissions";
import {
  BRAIN_PREVIEW_LIMIT,
  brainLanguageSchema,
  brainMemoryInputSchema,
  nativeBrainCount,
  nativeBrainRecommendations,
  nativeGenerationSchema,
  nativeMemoriesSchema,
  nativeMemorySchema,
  nativeRecommendationsSchema,
  nativeStatusReceiptSchema,
} from "@/lib/brain/native";
import { requireWorkspaceRole } from "./_workspace";
import { throwIfError } from "./_supabase";

const wsInput = z.object({ workspaceId: z.string().uuid() });
const READ_ROLES = ["owner", "admin", "editor", "viewer"] as const;
const recommendationColumns = "id, kind, title, rationale, score, status, expires_at, created_at";
const memoryColumns = "id, kind, content, created_at";

/** Saved native recommendations only. A preview is not a workspace-wide total. */
export const listRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => wsInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId, READ_ROLES);
    const checkedAt = new Date().toISOString();
    const result = await supabase
      .from("brain_recommendations")
      .select(recommendationColumns, { count: "exact" })
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(BRAIN_PREVIEW_LIMIT);
    throwIfError(result.error);
    return nativeRecommendationsSchema.parse({
      items: result.data,
      total: result.count,
      limit: BRAIN_PREVIEW_LIMIT,
      checkedAt,
    });
  });

/** A manual status acknowledgement, not execution of the suggested action. */
export const updateRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        id: z.string().uuid(),
        status: z.enum(["applied", "dismissed"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId, WORKSPACE_EDIT_ROLES);
    const checkedAt = new Date().toISOString();
    const result = await supabase
      .from("brain_recommendations")
      .update({ status: data.status })
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.id)
      .eq("status", "open")
      .or(`expires_at.is.null,expires_at.gt.${checkedAt}`)
      .select("id, workspace_id, status")
      .single();
    throwIfError(result.error);
    const receipt = nativeStatusReceiptSchema.parse(result.data);
    if (
      receipt.id !== data.id ||
      receipt.workspace_id !== data.workspaceId ||
      receipt.status !== data.status
    )
      throw new Error("The recommendation change was not confirmed.");
    return receipt;
  });

/**
 * Explicit native rules generation. No AI/provider calls.
 * Append one batch only after every source read succeeded. Never expire/delete
 * previous results before a write: a failed insert must not destroy history.
 * No distributed exactly-once guarantee: callers must not retry POST blindly.
 */
export const runBrainRecommend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    wsInput
      .extend({
        language: brainLanguageSchema.default("pt-BR"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId, WORKSPACE_EDIT_ROLES);
    const ws = data.workspaceId;
    const results = await Promise.all([
      supabase.from("brands").select("id", { count: "exact", head: true }).eq("workspace_id", ws),
      supabase
        .from("channels")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ws)
        .eq("status", "connected"),
      supabase.from("content").select("id", { count: "exact", head: true }).eq("workspace_id", ws),
      supabase
        .from("content")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ws)
        .eq("status", "draft"),
      supabase
        .from("missions")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ws)
        .in("status", ["pending", "in_progress"]),
    ]);
    const counts = results.map((result) => {
      throwIfError(result.error);
      return nativeBrainCount(result.count);
    });
    const recs = nativeBrainRecommendations(
      {
        brands: counts[0],
        connectedChannels: counts[1],
        content: counts[2],
        drafts: counts[3],
        activeMissions: counts[4],
      },
      data.language,
    );
    if (recs.length === 0)
      return nativeGenerationSchema.parse({ generated: 0, eventRecorded: false });
    const inserted = await supabase
      .from("brain_recommendations")
      .insert(
        recs.map((rec) => ({
          ...rec,
          workspace_id: ws,
          status: "open" as const,
        })),
      )
      .select("id");
    throwIfError(inserted.error);
    const ids = z.array(z.object({ id: z.string().uuid() })).parse(inserted.data);
    if (ids.length !== recs.length || new Set(ids.map((row) => row.id)).size !== recs.length)
      throw new Error("The generated recommendation batch was not confirmed.");

    // The main insert is already confirmed. A secondary event failure is partial
    // success, never a reason to invite a duplicate generation.
    let eventRecorded = false;
    try {
      const event = await supabase
        .from("domain_events")
        .insert({
          workspace_id: ws,
          event_type: "BrainRecommendationCreated",
          payload: { count: ids.length },
        })
        .select("id")
        .single();
      eventRecorded =
        !event.error && z.object({ id: z.string().uuid() }).safeParse(event.data).success;
    } catch {
      /* Return a truthful secondary-record warning without rethrowing a saved batch. */
    }
    return nativeGenerationSchema.parse({ generated: ids.length, eventRecorded });
  });

export const listMemories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => wsInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId, READ_ROLES);
    const checkedAt = new Date().toISOString();
    const result = await supabase
      .from("brain_memories")
      .select(memoryColumns, { count: "exact" })
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(BRAIN_PREVIEW_LIMIT);
    throwIfError(result.error);
    return nativeMemoriesSchema.parse({
      items: result.data,
      total: result.count,
      limit: BRAIN_PREVIEW_LIMIT,
      checkedAt,
    });
  });

export const addMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    brainMemoryInputSchema.extend({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId, WORKSPACE_EDIT_ROLES);
    const result = await supabase
      .from("brain_memories")
      .insert({
        workspace_id: data.workspaceId,
        kind: data.kind,
        content: data.content,
      })
      .select(memoryColumns)
      .single();
    throwIfError(result.error);
    const row = nativeMemorySchema.parse(result.data);
    if (row.kind !== data.kind || row.content !== data.content)
      throw new Error("The saved memory was not confirmed.");
    return row;
  });
