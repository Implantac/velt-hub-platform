/**
 * VELT — Growth Intelligence server functions.
 *
 * Exposes the pure engines in `src/lib/growth/*` to the UI. Timing suggestions
 * use an explicitly selected channel's attributed send/measurement history when
 * sufficient evidence exists, or clearly identified editorial references.
 * Generic platform references never claim account-specific measured results.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { throwIfError } from "./_supabase";
import { adReadiness, preflight, suggestHooks } from "@/lib/growth/post-quality";
import {
  cadenceTarget,
  MIN_OBSERVATIONS_PER_SLOT,
  MIN_OBSERVATIONS_TOTAL,
  nextBestSlot,
  nextSlotOccurrence,
  observationBasis,
  rankSlots,
} from "@/lib/growth/scheduling";
import {
  timingObservations,
  TIMING_HISTORY_DAYS,
  TIMING_JOB_LIMIT,
} from "@/lib/growth/timing-observations";
import type { TimingRecommendation } from "@/lib/growth/timing";
import { isTimeZone } from "@/lib/time-zones";
import { ALL_PLATFORMS, PUBLISH_ENABLED, rulesFor } from "@/lib/growth/platform-rules";
import { requireWorkspaceRole } from "./_workspace";
import { readAllPages } from "./_pagination";

const PlatformInput = z.enum(ALL_PLATFORMS);

/* ------------------------------------------------------------------ */
/* Preflight                                                           */
/* ------------------------------------------------------------------ */

/**
 * Runs the full preflight for one draft against every target channel.
 * Used by the composer (live, as the user types) and by the scheduler before
 * enqueueing — a blocker here would otherwise become a failed job later.
 */
export const preflightDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        body: z.string().max(20000).default(""),
        title: z.string().max(500).nullish(),
        mediaCount: z.number().int().min(0).max(20).default(0),
        channelIds: z.array(z.string().uuid()).max(20).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Resolve target platforms. With no explicit channels, check every platform
    // the workspace can publish to — the composer previews all of them.
    let platforms: string[] = [];
    if (data.channelIds.length > 0) {
      const { data: rows, error } = await supabase
        .from("channels")
        .select("id, platform, handle")
        .eq("workspace_id", data.workspaceId)
        .in("id", data.channelIds);
      throwIfError(error);
      platforms = (rows ?? []).map((r) => String(r.platform));
    } else {
      const { data: rows, error } = await supabase
        .from("channels")
        .select("platform")
        .eq("workspace_id", data.workspaceId);
      throwIfError(error);
      platforms = [...new Set((rows ?? []).map((r) => String(r.platform)))];
    }
    if (platforms.length === 0) platforms = ["instagram"];

    const results = platforms.map((platform) => {
      const check = preflight({
        body: data.body,
        title: data.title ?? null,
        platform,
        mediaCount: data.mediaCount,
      });
      return {
        ...check,
        platform,
        ad: adReadiness(data.body, platform),
      };
    });

    return {
      channels: results,
      /** Worst-case verdict: publish is only safe if every channel passes. */
      canPublish: results.every((r) => r.passed),
      blockerCount: results.reduce((a, r) => a + r.blockers.length, 0),
      warningCount: results.reduce((a, r) => a + r.warnings.length, 0),
    };
  });

/* ------------------------------------------------------------------ */
/* Hook suggestions                                                    */
/* ------------------------------------------------------------------ */

export const suggestPostHooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        body: z.string().max(20000),
        platform: PlatformInput.default("instagram"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => suggestHooks(data.body, String(data.platform)));

/* ------------------------------------------------------------------ */
/* Best time to post                                                   */
/* ------------------------------------------------------------------ */

/** Explicit channel history or an explicitly selected, history-free platform reference. */
export const getBestTimeToPost = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        platform: PlatformInput,
        channelId: z.string().uuid().optional(),
        timeZone: z.string().max(100).refine(isTimeZone, "Invalid time zone").default("UTC"),
        from: z.string().datetime().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<TimingRecommendation> => {
    const { supabase, userId } = context;
    await requireWorkspaceRole(supabase, data.workspaceId, userId);
    const from = data.from ? new Date(data.from) : new Date();
    let channel: TimingRecommendation["channel"] = null;
    let measured: ReturnType<typeof timingObservations> = {
      observations: [],
      latestCapturedAt: null,
    };
    if (data.channelId) {
      const selected = await supabase
        .from("channels")
        .select("id,platform,handle,status")
        .eq("workspace_id", data.workspaceId)
        .eq("id", data.channelId)
        .maybeSingle();
      throwIfError(selected.error);
      if (!selected.data || selected.data.platform !== data.platform)
        throw new Error("Canal não encontrado neste workspace e plataforma.");
      channel = {
        id: selected.data.id,
        handle: selected.data.handle,
        status: selected.data.status,
      };
      const since = new Date(from.getTime() - TIMING_HISTORY_DAYS * 86400_000).toISOString();
      const jobs = await supabase
        .from("scheduler_jobs")
        .select("id,channel_id,content_id,status,external_post_id,delivery_started_at")
        .eq("workspace_id", data.workspaceId)
        .eq("channel_id", channel.id)
        .eq("status", "succeeded")
        .not("external_post_id", "is", null)
        .not("external_post_id", "like", "sim\\_%")
        .gte("delivery_started_at", since)
        .lte("delivery_started_at", from.toISOString())
        .order("delivery_started_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(TIMING_JOB_LIMIT);
      throwIfError(jobs.error);
      if (!jobs.data) throw new Error("O histórico de envios não foi retornado.");
      if (jobs.data.length > 0) {
        const contentIds = [...new Set(jobs.data.map((j) => j.content_id))];
        const snapshots = await readAllPages(
          (first, last) =>
            supabase
              .from("analytics_snapshots")
              .select("id,channel_id,content_id,captured_at,metrics")
              .eq("workspace_id", data.workspaceId)
              .eq("channel_id", channel!.id)
              .in("content_id", contentIds)
              .gte("captured_at", since)
              .lte("captured_at", from.toISOString())
              .order("captured_at", { ascending: false })
              .order("id", { ascending: true })
              .range(first, last),
          { maxRows: 50_000 },
        );
        measured = timingObservations(jobs.data, snapshots, from.getTime());
      }
    }
    const { observations, latestCapturedAt } = measured;
    const best = nextBestSlot(data.platform, observations, from, 30, data.timeZone);
    const topSlots = rankSlots(data.platform, observations, data.timeZone)
      .slice(0, 6)
      .flatMap((slot) => {
        const next = nextSlotOccurrence(slot, from, data.timeZone);
        return next
          ? [
              {
                at: next.at.toISOString(),
                weekday: slot.weekday,
                hour: slot.hour,
                samples: slot.samples,
                confidence: slot.confidence,
              },
            ]
          : [];
      });
    const profile = await supabase
      .from("user_profile_digital")
      .select("time_budget_hours_week,experience_level")
      .eq("user_id", userId)
      .maybeSingle();
    throwIfError(profile.error);
    const cadence = cadenceTarget(data.platform, profile.data);
    return {
      workspaceId: data.workspaceId,
      platform: data.platform,
      channel,
      timeZone: data.timeZone,
      referenceAt: from.toISOString(),
      best: { at: best.at, confidence: best.confidence, samples: best.samples },
      topSlots,
      usedFallback: best.confidence === "baseline",
      observationsCount: observations.length,
      basis: observationBasis(observations),
      minimum: { total: MIN_OBSERVATIONS_TOTAL, perSlot: MIN_OBSERVATIONS_PER_SLOT },
      history: { days: TIMING_HISTORY_DAYS, maxJobs: TIMING_JOB_LIMIT, latestCapturedAt },
      cadence: {
        perWeek: cadence.perWeek,
        source: cadence.source,
        reasonCode: cadence.reasonCode,
        hoursPerWeek: cadence.hoursPerWeek,
      },
    };
  });

/* ------------------------------------------------------------------ */
/* Platform reference                                                  */
/* ------------------------------------------------------------------ */

/** Static reference used to render the composer's platform checklist. */
export const getPlatformRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ platform: PlatformInput.default("instagram") }).parse(input),
  )
  .handler(async ({ data }) => {
    const rules = rulesFor(String(data.platform));
    return {
      rules,
      publishEnabled: PUBLISH_ENABLED.has(String(data.platform) as never),
    };
  });

/* ------------------------------------------------------------------ */
/* Publishing capability (honesty surface)                             */
/* ------------------------------------------------------------------ */

/**
 * Reports, per platform, whether automated publishing is genuinely wired and
 * whether the OAuth credentials exist in this environment.
 *
 * This endpoint exists to keep the UI honest: the scheduler and the channel
 * screen use it to disable "agendar" on platforms that would fail, instead of
 * letting the user discover it through a dead-letter job hours later.
 */
export const getPublishCapabilities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { publisherCapabilities } = await import("@/lib/scheduler/publishers.server");
    const caps = publisherCapabilities();
    return {
      platforms: caps,
      /** True when running with simulated publishers (local dev/demo). */
      simulated: process.env.VELT_PUBLISHER_MODE === "simulate",
      readyCount: caps.filter((c) => c.implemented && c.credentialsReady).length,
    };
  });

/* ------------------------------------------------------------------ */
/* AI coach (rewrites verified by the deterministic engine)            */
/* ------------------------------------------------------------------ */

/**
 * In-memory throttle. Deliberately simple and per-process: this endpoint burns
 * model tokens, and the realistic abuse case is a client stuck in a retry loop
 * (network flakiness, a React effect without a guard), not a distributed attack.
 * A shared limiter would need Redis; pretending this is one would be worse than
 * saying what it is.
 *
 * Reset on cold start is acceptable: the worst case is one extra model call.
 */
const COACH_WINDOW_MS = 60_000;
const COACH_MAX_PER_WINDOW = 8;
const coachHits = new Map<string, number[]>();

function throttleCoach(userId: string): { ok: true } | { ok: false; retryIn: number } {
  const now = Date.now();
  const hits = (coachHits.get(userId) ?? []).filter((t) => now - t < COACH_WINDOW_MS);
  if (hits.length >= COACH_MAX_PER_WINDOW) {
    const oldest = hits[0];
    return { ok: false, retryIn: Math.ceil((COACH_WINDOW_MS - (now - oldest)) / 1000) };
  }
  hits.push(now);
  coachHits.set(userId, hits);
  // Opportunistic cleanup so the map does not grow with every user forever.
  if (coachHits.size > 500) {
    for (const [k, v] of coachHits) {
      if (v.every((t) => now - t >= COACH_WINDOW_MS)) coachHits.delete(k);
    }
  }
  return { ok: true };
}

export const coachDraftWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        body: z.string().max(20000),
        platform: PlatformInput.default("instagram"),
        title: z.string().max(500).nullish(),
        mediaCount: z.number().int().min(0).max(20).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // A draft too short to diagnose costs a model call and returns nothing.
    if (data.body.trim().length < 20) {
      return {
        source: "unavailable" as const,
        suggestions: [],
        issueIds: [],
        skippedReason: "all_rejected" as const,
      };
    }

    const gate = throttleCoach(userId);
    if (!gate.ok) {
      return {
        source: "unavailable" as const,
        suggestions: [],
        issueIds: [],
        skippedReason: "model_failed" as const,
        retryInSeconds: gate.retryIn,
      };
    }

    // Brand voice makes the rewrite sound like the business instead of like a
    // model. Fetched narrowly: only the newest brand's voice block.
    const { data: brand } = await supabase
      .from("brands")
      .select("name, voice")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const { coachDraft } = await import("@/lib/growth/coach.server");
    return coachDraft({
      body: data.body,
      platform: String(data.platform),
      title: data.title ?? null,
      mediaCount: data.mediaCount,
      brandVoice: (brand?.voice ?? null) as Record<string, unknown> | null,
    });
  });
