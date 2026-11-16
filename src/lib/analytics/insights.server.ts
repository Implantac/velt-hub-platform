/**
 * Per-post provider reads. Missing observations are null, never invented zeros.
 * Required reads fail visibly; optional account reads can return a partial result.
 * Provider approval/scopes still require external homologation, not just these parsers.
 */
import { metaGraphBase } from "@/lib/oauth/meta-version.server";
import type { CanonicalMetrics } from "./normalize";
import { fromFacebook, fromInstagram, fromLinkedIn, fromYouTube } from "./normalize";

type Raw = Record<string, unknown>;
export interface InsightContext {
  platform: string;
  externalPostId: string;
  accessToken: string;
  channelConfig: Record<string, unknown>;
  channelExternalId?: string | null;
}
export interface InsightResult {
  metrics: CanonicalMetrics;
  accountFollowers?: number;
  warnings?: Array<"additional_metrics_unavailable">;
}
export class InsightAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsightAuthError";
  }
}
export class InsightRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsightRateLimitError";
  }
}
export class InsightMetricsError extends Error {
  constructor() {
    super("O provedor retornou contadores ou uma resposta de métricas inválidos.");
    this.name = "InsightMetricsError";
  }
}
const object = (value: unknown): Raw | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null;

/** Reject malformed upstream counters before a permissive normalizer could turn them into zero. */
function counter(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+$/.test(value)))
    throw new InsightMetricsError();
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new InsightMetricsError();
  return n;
}
function hasCounters(raw: Raw, keys: readonly string[]): boolean {
  let observed = false;
  for (const key of keys) if (counter(raw[key]) !== undefined) observed = true;
  return observed;
}
function hasInsights(raw: Raw, names: readonly string[]): boolean {
  if (raw.data === undefined) return false;
  if (!Array.isArray(raw.data)) throw new InsightMetricsError();
  let observed = false;
  for (const item of raw.data) {
    const metric = object(item);
    if (!metric || !names.includes(String(metric.name))) continue;
    const first = Array.isArray(metric.values) ? object(metric.values[0]) : null;
    const value = first?.value ?? object(metric.total_value)?.value ?? metric.total_value;
    if (metric.name === "post_reactions_by_type_total" && object(value)) {
      for (const n of Object.values(value as Raw)) if (counter(n) !== undefined) observed = true;
    } else if (counter(value) !== undefined) observed = true;
  }
  return observed;
}

/** Credentials belong in headers, and no upstream body/URL belongs in a public error. */
async function readJson(
  url: URL | string,
  accessToken: string,
  headers: Record<string, string> = {},
): Promise<Raw> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, ...headers },
    signal: AbortSignal.timeout(15_000),
  });
  let json: Raw | null = null;
  try {
    json = object(JSON.parse(await response.text()));
  } catch {
    /* safe error below */
  }
  if (!response.ok) {
    const error = object(json?.error);
    const quota =
      Array.isArray(error?.errors) &&
      error.errors.some((e) =>
        [
          "quotaExceeded",
          "dailyLimitExceeded",
          "rateLimitExceeded",
          "userRateLimitExceeded",
        ].includes(String(object(e)?.reason)),
      );
    if (response.status === 429 || quota || error?.code === 4 || error?.code === 17) {
      throw new InsightRateLimitError("O provedor limitou a leitura de métricas.");
    }
    if (response.status === 401 || response.status === 403 || error?.code === 190) {
      throw new InsightAuthError("O provedor recusou a autorização para ler métricas.");
    }
    throw new Error("Não foi possível ler as métricas no provedor.");
  }
  if (!json || json.error) throw new InsightMetricsError();
  return json;
}

const IG_INSIGHT_METRICS = [
  "impressions",
  "reach",
  "saved",
  "shares",
  "total_interactions",
  "plays",
];
export async function collectInstagram(ctx: InsightContext): Promise<InsightResult | null> {
  const url = new URL(`${metaGraphBase()}/${ctx.externalPostId}/insights`);
  url.searchParams.set("metric", IG_INSIGHT_METRICS.join(","));
  const mediaUrl = new URL(`${metaGraphBase()}/${ctx.externalPostId}`);
  mediaUrl.searchParams.set("fields", "like_count,comments_count,media_type,timestamp");
  const [insights, media] = await Promise.all([
    readJson(url, ctx.accessToken),
    readJson(mediaUrl, ctx.accessToken),
  ]);
  const insightObserved = hasInsights(insights, [...IG_INSIGHT_METRICS, "views", "video_views"]);
  const mediaObserved = hasCounters(media, ["like_count", "comments_count"]);
  if (!insightObserved && !mediaObserved) return null;
  const warnings: NonNullable<InsightResult["warnings"]> = insightObserved
    ? []
    : ["additional_metrics_unavailable"];
  let accountFollowers: number | undefined;
  const igUserId = ctx.channelConfig.ig_user_id ?? ctx.channelExternalId;
  if (typeof igUserId === "string" && igUserId) {
    try {
      const accountUrl = new URL(`${metaGraphBase()}/${igUserId}`);
      accountUrl.searchParams.set("fields", "followers_count");
      accountFollowers = counter((await readJson(accountUrl, ctx.accessToken)).followers_count);
      if (accountFollowers === undefined) warnings.push("additional_metrics_unavailable");
    } catch {
      warnings.push("additional_metrics_unavailable");
    }
  }
  return {
    metrics: fromInstagram(media, insights),
    accountFollowers,
    warnings: [...new Set(warnings)],
  };
}

const FB_INSIGHT_METRICS = [
  "post_impressions",
  "post_impressions_unique",
  "post_engaged_users",
  "post_clicks",
  "post_video_views",
  "post_reactions_by_type_total",
];
export async function collectFacebook(ctx: InsightContext): Promise<InsightResult | null> {
  const url = new URL(`${metaGraphBase()}/${ctx.externalPostId}/insights`);
  url.searchParams.set("metric", FB_INSIGHT_METRICS.join(","));
  const postUrl = new URL(`${metaGraphBase()}/${ctx.externalPostId}`);
  postUrl.searchParams.set("fields", "likes.summary(true),comments.summary(true),shares");
  const [insights, post] = await Promise.all([
    readJson(url, ctx.accessToken),
    readJson(postUrl, ctx.accessToken),
  ]);
  const flattened: Raw = {
    likes_count: object(object(post.likes)?.summary)?.total_count,
    comments_count: object(object(post.comments)?.summary)?.total_count,
    shares_count: object(post.shares)?.count,
  };
  const insightObserved = hasInsights(insights, FB_INSIGHT_METRICS);
  const postObserved = hasCounters(flattened, ["likes_count", "comments_count", "shares_count"]);
  if (!insightObserved && !postObserved) return null;
  return {
    metrics: fromFacebook(flattened, insights),
    warnings: insightObserved ? [] : ["additional_metrics_unavailable"],
  };
}

export async function collectYouTube(ctx: InsightContext): Promise<InsightResult | null> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "statistics");
  url.searchParams.set("id", ctx.externalPostId);
  const json = await readJson(url, ctx.accessToken);
  if (!Array.isArray(json.items)) throw new InsightMetricsError();
  const statistics = object(object(json.items[0])?.statistics);
  if (
    !statistics ||
    !hasCounters(statistics, ["viewCount", "likeCount", "commentCount", "favoriteCount"])
  )
    return null;
  let channelStats: Raw | undefined;
  const warnings: NonNullable<InsightResult["warnings"]> = [];
  if (ctx.channelExternalId) {
    try {
      const channelUrl = new URL("https://www.googleapis.com/youtube/v3/channels");
      channelUrl.searchParams.set("part", "statistics");
      channelUrl.searchParams.set("id", ctx.channelExternalId);
      const channel = await readJson(channelUrl, ctx.accessToken);
      channelStats = Array.isArray(channel.items)
        ? (object(object(channel.items[0])?.statistics) ?? undefined)
        : undefined;
      if (counter(channelStats?.subscriberCount) === undefined)
        warnings.push("additional_metrics_unavailable");
    } catch {
      channelStats = undefined;
      warnings.push("additional_metrics_unavailable");
    }
  }
  return {
    metrics: fromYouTube(statistics, channelStats),
    accountFollowers: counter(channelStats?.subscriberCount),
    warnings,
  };
}

const LINKEDIN_VERSION = "202601";
export async function collectLinkedIn(ctx: InsightContext): Promise<InsightResult | null> {
  const headers = { "LinkedIn-Version": LINKEDIN_VERSION, "X-Restli-Protocol-Version": "2.0.0" };
  const social = await readJson(
    `https://api.linkedin.com/v2/socialActions/${encodeURIComponent(ctx.externalPostId)}`,
    ctx.accessToken,
    headers,
  );
  let stats: Raw = {
    likeCount: object(social.likesSummary)?.totalLikes,
    commentCount: object(social.commentsSummary)?.totalFirstLevelComments,
  };
  const socialObserved = hasCounters(stats, ["likeCount", "commentCount"]);
  const orgId = ctx.channelConfig.organization_id;
  const warnings: NonNullable<InsightResult["warnings"]> = [];
  let orgObserved = false;
  if (typeof orgId === "string" && orgId) {
    const url = new URL("https://api.linkedin.com/rest/organizationalEntityShareStatistics");
    url.searchParams.set("q", "organizationalEntity");
    url.searchParams.set("organizationalEntity", `urn:li:organization:${orgId}`);
    url.searchParams.set("shares", `List(${ctx.externalPostId})`);
    const json = await readJson(url, ctx.accessToken, headers);
    const org = Array.isArray(json.elements)
      ? object(object(json.elements[0])?.totalShareStatistics)
      : null;
    if (org) {
      const keys = [
        "likeCount",
        "commentCount",
        "shareCount",
        "clickCount",
        "impressionCount",
        "uniqueImpressionsCount",
      ];
      orgObserved = hasCounters(org, keys);
      stats = {
        ...stats,
        ...Object.fromEntries(
          keys.filter((k) => org[k] !== undefined && org[k] !== null).map((k) => [k, org[k]]),
        ),
      };
    }
    if (!orgObserved) warnings.push("additional_metrics_unavailable");
  }
  if (!socialObserved && !orgObserved) return null;
  return { metrics: fromLinkedIn(stats), warnings };
}

// Only implemented readers belong in the operational registry. TikTok's extra
// approved capability and Google Business location aggregates are not per-post
// collectors here; the runner reports them as unsupported, never invokes stubs.
const COLLECTORS: Record<string, (ctx: InsightContext) => Promise<InsightResult | null>> = {
  instagram: collectInstagram,
  facebook: collectFacebook,
  youtube: collectYouTube,
  linkedin: collectLinkedIn,
};
export function collectorFor(platform: string) {
  return COLLECTORS[platform] ?? null;
}
export function platformsWithInsights(): string[] {
  return Object.keys(COLLECTORS);
}
