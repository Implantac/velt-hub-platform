/** Dashboard previews are reads of saved data, never Brain generation/provider calls. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireWorkspaceRole } from "./_workspace";
import { dashboardCount, dashboardOptionalRow, dashboardRows } from "@/lib/dashboard/overview";
import {
  DASHBOARD_QUESTIONS,
  dashboardScoreSchema,
  savedDashboardAnswer,
  savedDashboardScore,
} from "@/lib/dashboard/saved-analysis";

const workspaceInput = z.object({ workspaceId: z.string().uuid() });

/** Saved answers may be old; return their dates/expiration rather than silently regenerating. */
export const getDashboardAnalysis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => workspaceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId);
    const checkedAt = new Date().toISOString();
    const [snapshotResult, answerResults] = await Promise.all([
      supabase
        .from("brain_snapshots")
        .select("scores, computed_at")
        .eq("workspace_id", data.workspaceId)
        .order("computed_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      Promise.all(
        DASHBOARD_QUESTIONS.map((question) =>
          supabase
            .from("brain_answers")
            .select("question, answer, computed_at, expires_at")
            .eq("workspace_id", data.workspaceId)
            .eq("question", question)
            .order("computed_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ),
      ),
    ]);
    return {
      score: savedDashboardScore(dashboardOptionalRow(snapshotResult)),
      answers: answerResults.flatMap((result) => {
        const row = dashboardOptionalRow(result);
        return row === null ? [] : [savedDashboardAnswer(row, checkedAt)];
      }),
    };
  });

export const getDashboardRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => workspaceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId);
    return dashboardRows(
      await supabase
        .from("coach_recommendations")
        .select("id, kind, title, body, cta, severity")
        .eq("workspace_id", data.workspaceId)
        .is("dismissed_at", null)
        .is("completed_at", null)
        .order("severity", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(4),
    );
  });

export const getDashboardOpportunities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => workspaceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId);
    return dashboardRows(
      await supabase
        .from("opportunities")
        .select("id, workspace_id, title, description, status")
        .or(`workspace_id.is.null,workspace_id.eq.${data.workspaceId}`)
        .in("status", ["exploding", "growing"])
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(3),
    );
  });

const BLUEPRINT_FIELDS = [
  "problem",
  "audience",
  "promise",
  "differentiator",
  "offer",
  "price",
  "channels",
  "content_pillars",
  "funnel",
  "metric",
] as const;
export const getDashboardBlueprint = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => workspaceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId);
    const result = await supabase
      .from("business_blueprints")
      .select(
        "problem, audience, promise, differentiator, offer, price, channels, content_pillars, funnel, metric",
      )
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    const row = dashboardOptionalRow(result);
    return {
      exists: row !== null,
      filled:
        row === null
          ? 0
          : BLUEPRINT_FIELDS.filter((field) => {
              const value = row[field];
              return typeof value === "string" && value.trim().length > 0;
            }).length,
      total: BLUEPRINT_FIELDS.length,
    };
  });

export const getDashboardCompetitors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => workspaceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId);
    const [total, high] = await Promise.all([
      supabase
        .from("competitors")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", data.workspaceId),
      supabase
        .from("competitors")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", data.workspaceId)
        .eq("threat", "high"),
    ]);
    return { total: dashboardCount(total), high: dashboardCount(high) };
  });

export const getDashboardSkills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => workspaceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId);
    const result = await supabase
      .from("skill_assessments")
      .select("id, score, assessed_at", { count: "exact" })
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", userId)
      .order("assessed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1);
    const latest = dashboardRows(result).at(0) ?? null;
    const total = dashboardCount(result);
    if (total > 0 && latest === null)
      throw new Error("Dashboard latest assessment was not returned.");
    return {
      total,
      latest:
        latest === null
          ? null
          : { score: dashboardScoreSchema.parse(latest.score), assessedAt: latest.assessed_at },
    };
  });

export const getDashboardJourney = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => workspaceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId);
    const [events, decisions] = await Promise.all([
      supabase
        .from("brain_memory_events")
        .select("id, created_at", { count: "exact" })
        .eq("workspace_id", data.workspaceId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1),
      supabase
        .from("brain_decisions")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", data.workspaceId),
    ]);
    const latest = dashboardRows(events).at(0) ?? null;
    const totalEvents = dashboardCount(events);
    if (totalEvents > 0 && latest === null)
      throw new Error("Dashboard latest memory event was not returned.");
    return {
      events: totalEvents,
      decisions: dashboardCount(decisions),
      latestEventAt: latest?.created_at ?? null,
    };
  });
