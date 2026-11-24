import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { WORKSPACE_EDIT_ROLES } from "@/lib/workspace/permissions";
import {
  MISSION_PAGE_SIZE,
  confirmMissionCreation,
  confirmMissionPage,
  confirmMissionStatus,
  missionCreateInputSchema,
  missionListInputSchema,
  missionStatusInputSchema,
} from "@/lib/missions/contracts";
import { throwIfError } from "./_supabase";
import { requireWorkspaceRole } from "./_workspace";

const READ_ROLES = ["owner", "admin", "editor", "viewer"] as const;
const columns =
  "id, workspace_id, title, description, status, priority, due_at, created_at, updated_at, created_by";

/** Read-only, bounded page. The total is for the same workspace and status filter. */
export const listMissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input) => missionListInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId, READ_ROLES);
    const checkedAt = new Date().toISOString();
    let query = supabase
      .from("missions")
      .select(columns, { count: "exact" })
      .eq("workspace_id", data.workspaceId);
    if (data.status !== "all") query = query.eq("status", data.status);
    const offset = (data.page - 1) * MISSION_PAGE_SIZE;
    const result = await query
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + MISSION_PAGE_SIZE - 1);
    let items = result.data;
    let total = result.count;
    if (result.error?.code === "PGRST103" && data.page > 1) {
      // PostgREST may reject an offset after a concurrent removal/transition.
      // Only an independently confirmed same-filter count can establish that
      // this page vanished. Other failures are never converted to empty rows.
      let countQuery = supabase
        .from("missions")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", data.workspaceId);
      if (data.status !== "all") countQuery = countQuery.eq("status", data.status);
      const counted = await countQuery;
      throwIfError(counted.error);
      if (counted.count === null || counted.count > offset) throwIfError(result.error);
      items = [];
      total = counted.count;
    } else {
      throwIfError(result.error);
    }
    return confirmMissionPage(
      {
        workspaceId: data.workspaceId,
        status: data.status,
        page: data.page,
        pageSize: MISSION_PAGE_SIZE,
        items,
        total,
        checkedAt,
      },
      data,
    );
  });

/** Explicit user command, not an AI generation or an automatically executed goal. */
export const createMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => missionCreateInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId, WORKSPACE_EDIT_ROLES);
    const result = await supabase
      .from("missions")
      .insert({
        workspace_id: data.workspaceId,
        title: data.title,
        description: data.description || null,
        priority: data.priority,
        status: "pending",
        created_by: userId,
      })
      .select(columns)
      .single();
    throwIfError(result.error);
    const receipt = confirmMissionCreation(
      { mission: result.data, eventRecorded: false },
      data,
      userId,
    );
    // A failed secondary event cannot turn an already confirmed insert into a
    // failed create or encourage another insert. No POST is retried here.
    let eventRecorded = false;
    try {
      const event = await supabase
        .from("domain_events")
        .insert({
          workspace_id: data.workspaceId,
          event_type: "MissionAssigned",
          payload: { mission_id: receipt.mission.id, title: receipt.mission.title },
        })
        .select("id")
        .single();
      eventRecorded =
        !event.error && z.object({ id: z.string().uuid() }).safeParse(event.data).success;
    } catch {
      /* Report partial success without exposing internal details or repeating the create. */
    }
    return { ...receipt, eventRecorded };
  });

/** Optimistic concurrency: never overwrite a status/version the caller did not read. */
export const updateMissionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => missionStatusInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId, WORKSPACE_EDIT_ROLES);
    const result = await supabase
      .from("missions")
      .update({ status: data.status })
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.id)
      .eq("status", data.expectedStatus)
      .eq("updated_at", data.expectedUpdatedAt)
      .select(columns)
      .single();
    throwIfError(result.error);
    return confirmMissionStatus(result.data, data);
  });
