import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireWorkspaceRole } from "./_workspace";
import {
  DASHBOARD_CONTENT_STATUSES,
  DASHBOARD_PREVIEW_LIMIT,
  dashboardCount,
  dashboardRows,
} from "@/lib/dashboard/overview";

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ws = data.workspaceId;
    await requireWorkspaceRole(supabase, ws, userId);
    // One cutoff for the upcoming list/total, not a promise of a transaction-wide snapshot.
    const checkedAt = new Date().toISOString();
    const [brands, channels, connected, contentCounts, jobs, recs, missions, events] =
      await Promise.all([
        supabase.from("brands").select("id", { count: "exact", head: true }).eq("workspace_id", ws),
        supabase
          .from("channels")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", ws),
        supabase
          .from("channels")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", ws)
          .eq("status", "connected"),
        Promise.all(
          DASHBOARD_CONTENT_STATUSES.map((status) =>
            supabase
              .from("content")
              .select("id", { count: "exact", head: true })
              .eq("workspace_id", ws)
              .eq("status", status),
          ),
        ),
        supabase
          .from("scheduler_jobs")
          .select("id, status, scheduled_at", { count: "exact" })
          .eq("workspace_id", ws)
          .eq("status", "pending")
          .gte("scheduled_at", checkedAt)
          .order("scheduled_at")
          .order("id")
          .limit(DASHBOARD_PREVIEW_LIMIT),
        supabase
          .from("brain_recommendations")
          .select("*")
          .eq("workspace_id", ws)
          .eq("status", "open")
          .order("score", { ascending: false })
          .order("id")
          .limit(3),
        supabase
          .from("missions")
          .select("id, title, status, priority")
          .eq("workspace_id", ws)
          .in("status", ["pending", "in_progress"])
          .order("priority", { ascending: false })
          .order("id")
          .limit(DASHBOARD_PREVIEW_LIMIT),
        supabase
          .from("domain_events")
          .select("id, event_type, payload, created_at")
          .eq("workspace_id", ws)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(8),
      ]);
    const contentByStatus: Record<string, number> = {};
    let totalContent = 0;
    for (const [index, status] of DASHBOARD_CONTENT_STATUSES.entries()) {
      const count = dashboardCount(contentCounts[index]);
      totalContent += count;
      if (count > 0) contentByStatus[status] = count;
    }
    if (!Number.isSafeInteger(totalContent))
      throw new Error("Dashboard count is outside the supported range.");
    return {
      counts: {
        brands: dashboardCount(brands),
        channels: dashboardCount(channels),
        channelsConnected: dashboardCount(connected),
        content: totalContent,
        upcomingJobs: dashboardCount(jobs),
      },
      contentByStatus,
      upcomingJobs: dashboardRows(jobs),
      recommendations: dashboardRows(recs),
      missions: dashboardRows(missions),
      events: dashboardRows(events),
      checkedAt,
    };
  });
