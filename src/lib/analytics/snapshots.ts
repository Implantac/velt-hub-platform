import { METRIC_COUNTERS, type CanonicalMetrics } from "./normalize";

export interface Snapshot {
  id: string;
  content_id: string | null;
  channel_id: string | null;
  captured_at: string;
  metrics: unknown;
  channel: { platform: string } | null;
  content?: { title: string | null } | null;
}
/** Provider metadata is not a metric. Only safe nonnegative counter values are read. */
export function cleanMetrics(raw: unknown): Partial<CanonicalMetrics> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const clean: Partial<CanonicalMetrics> = {};
  for (const key of METRIC_COUNTERS) {
    const value = input[key];
    if (typeof value !== "number" && !(typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)))
      continue;
    const n = Number(value);
    if (Number.isSafeInteger(n) && n >= 0) clean[key] = n;
  }
  return clean;
}
function postId(row: Pick<Snapshot, "metrics">): string | null {
  const raw =
    row.metrics && typeof row.metrics === "object" ? (row.metrics as Record<string, unknown>) : {};
  return typeof raw.post_id === "string" && raw.post_id.trim() ? raw.post_id : null;
}
export function snapshotKey(row: Pick<Snapshot, "content_id" | "channel_id" | "metrics">) {
  const external = postId(row);
  return JSON.stringify([
    row.channel_id,
    external ? "post" : "content",
    external ?? row.content_id,
  ]);
}
const utcDay = (row: Pick<Snapshot, "captured_at">) =>
  new Date(row.captured_at).toISOString().slice(0, 10);

/** Lifetime cumulative observations: deduplicate each external post, never add repeated reads. */
export function latestSnapshots(rows: Snapshot[], perDay = false): Snapshot[] {
  const candidates = rows.filter(
    (row) =>
      row.channel_id &&
      row.content_id &&
      Number.isFinite(Date.parse(row.captured_at)) &&
      !postId(row)?.startsWith("sim_") &&
      Object.keys(cleanMetrics(row.metrics)).length > 0,
  );
  const contentKey = (row: Snapshot) =>
    JSON.stringify([row.channel_id, row.content_id, perDay ? utcDay(row) : ""]);
  // Old snapshots without a publication ID cannot be attributed to a second post.
  // Keep them only when this content/channel (and day, for daily data) has no
  // identified observation, rather than double-counting legacy + new data.
  const identified = new Set(candidates.filter((row) => postId(row)).map(contentKey));
  const latest = new Map<string, Snapshot>();
  for (const row of candidates) {
    if (!postId(row) && identified.has(contentKey(row))) continue;
    const key = snapshotKey(row) + (perDay ? ":" + utcDay(row) : "");
    const previous = latest.get(key);
    const time = Date.parse(row.captured_at);
    const priorTime = previous ? Date.parse(previous.captured_at) : -Infinity;
    if (!previous || time > priorTime || (time === priorTime && row.id > previous.id))
      latest.set(key, row);
  }
  return [...latest.values()].sort(
    (a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at) || a.id.localeCompare(b.id),
  );
}
export function aggregateSnapshots(rows: Snapshot[]) {
  const totals = { impressions: 0, engagement: 0, reach: 0, posts: 0 };
  const platforms = new Map<
    string,
    { platform: string; impressions: number; engagement: number }
  >();
  for (const row of latestSnapshots(rows)) {
    const m = cleanMetrics(row.metrics);
    totals.impressions += m.impressions ?? 0;
    totals.engagement += m.engagement ?? 0;
    totals.reach += m.reach ?? 0;
    totals.posts++;
    const platform = row.channel?.platform ?? "other";
    const value = platforms.get(platform) ?? { platform, impressions: 0, engagement: 0 };
    value.impressions += m.impressions ?? 0;
    value.engagement += m.engagement ?? 0;
    platforms.set(platform, value);
  }
  const daily = new Map<
    string,
    { date: string; impressions: number; engagement: number; reach: number }
  >();
  for (const row of latestSnapshots(rows, true)) {
    const date = utcDay(row);
    const m = cleanMetrics(row.metrics);
    const d = daily.get(date) ?? { date, impressions: 0, engagement: 0, reach: 0 };
    d.impressions += m.impressions ?? 0;
    d.engagement += m.engagement ?? 0;
    d.reach += m.reach ?? 0;
    daily.set(date, d);
  }
  return {
    totals,
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byPlatform: [...platforms.values()].sort((a, b) => a.platform.localeCompare(b.platform)),
  };
}
