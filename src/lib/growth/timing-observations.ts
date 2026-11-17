import { cleanMetrics } from "@/lib/analytics/snapshots";
import type { SlotObservation } from "./scheduling";

export const TIMING_HISTORY_DAYS = 180;
export const TIMING_JOB_LIMIT = 300;
export interface TimingJob {
  id: string;
  channel_id: string;
  content_id: string;
  status: string;
  external_post_id: string | null;
  delivery_started_at: string | null;
}
export interface TimingSnapshot {
  id: string;
  channel_id: string | null;
  content_id: string | null;
  captured_at: string;
  metrics: unknown;
}
const identity = (channel: string, post: string) => JSON.stringify([channel, post]);
const postId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.trim() === value &&
  value.length > 0 &&
  !value.startsWith("sim_");

/**
 * One observation per attributed external publication/channel, never per
 * content ID or collection. Old/unattributed/corrupt rows do not become zeros.
 * Send-start is a documented timing proxy; scheduled_at is NOT publish time.
 */
export function timingObservations(
  jobs: TimingJob[],
  snapshots: TimingSnapshot[],
  referenceTime = Date.now(),
): { observations: SlotObservation[]; latestCapturedAt: string | null } {
  const eligible = jobs.filter(
    (j) =>
      j.status === "succeeded" &&
      postId(j.external_post_id) &&
      !!j.channel_id &&
      !!j.content_id &&
      !!j.delivery_started_at &&
      Number.isFinite(Date.parse(j.delivery_started_at)) &&
      Date.parse(j.delivery_started_at) <= referenceTime,
  );
  const jobsById = new Map(eligible.map((j) => [j.id, j]));
  const signatures = new Map<string, Set<string>>();
  for (const job of eligible) {
    const key = identity(job.channel_id, job.external_post_id!);
    const set = signatures.get(key) ?? new Set();
    set.add(JSON.stringify([job.content_id, Date.parse(job.delivery_started_at!)]));
    signatures.set(key, set);
  }
  const latest = new Map<string, { row: TimingSnapshot; job: TimingJob }>();
  for (const row of snapshots) {
    const raw = row.metrics;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const meta = raw as Record<string, unknown>;
    if (meta.source !== "sync" || !postId(meta.post_id) || typeof meta.job_id !== "string")
      continue;
    const job = jobsById.get(meta.job_id);
    const captured = Date.parse(row.captured_at);
    if (
      !job ||
      row.channel_id !== job.channel_id ||
      row.content_id !== job.content_id ||
      meta.post_id !== job.external_post_id ||
      !Number.isFinite(captured) ||
      captured > referenceTime ||
      captured < Date.parse(job.delivery_started_at!)
    )
      continue;
    const key = identity(job.channel_id, job.external_post_id!);
    if (signatures.get(key)?.size !== 1) continue; // Conflicting send/content attribution is not evidence.
    const previous = latest.get(key);
    if (
      !previous ||
      captured > Date.parse(previous.row.captured_at) ||
      (captured === Date.parse(previous.row.captured_at) && row.id > previous.row.id)
    )
      latest.set(key, { row, job });
  }
  const records = [...latest.values()]
    .map(({ row, job }) => ({ row, job, metrics: cleanMetrics(row.metrics) }))
    // Missing engagement is unavailable, not zero; zero actually recorded is kept.
    .filter(({ metrics }) => metrics.engagement !== undefined);
  // A reach-based ratio and an impressions-based ratio are not the same unit.
  // Pick one denominator with complete positive coverage, or compare raw counts for all.
  const denominator =
    records.length > 0 && records.every((r) => (r.metrics.impressions ?? 0) > 0)
      ? "impressions"
      : records.length > 0 && records.every((r) => (r.metrics.reach ?? 0) > 0)
        ? "reach"
        : null;
  const observations: SlotObservation[] = records.map(({ job, metrics }) => ({
    publishedAt: job.delivery_started_at!,
    engagement: metrics.engagement!,
    ...(denominator ? { impressions: metrics[denominator]! } : {}),
  }));
  const latestCapturedAt =
    records.map((r) => r.row.captured_at).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  return { observations, latestCapturedAt };
}
