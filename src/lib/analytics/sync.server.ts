/**
 * Server-only collection of real, published posts.
 *
 * Each validated observation is committed through one version-fenced database
 * transaction. Only its receipt counts as saved; the same transaction maintains
 * the channel's last collection date. There is no SELECT/merge/write window,
 * direct timestamp write, or automatic retry of an unacknowledged commit.
 * Same-day counters are conservative cumulative maxima, not additive deltas.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { invalidateTokenVersion } from "@/lib/oauth/store.server";
import { getFreshToken } from "@/lib/oauth/refresh.server";
import {
  InsightAuthError,
  InsightMetricsError,
  InsightRateLimitError,
  collectorFor,
} from "./insights.server";
import { observationMetrics } from "./normalize";
import { hasObservationReceipt, type SyncIssueCode, type SyncSummary } from "./sync-result";
import { precheckMedia } from "@/lib/scheduler/media";

export type { SyncSummary } from "./sync-result";

const DEFAULT_LOOKBACK_DAYS = 30;
const MAX_POSTS_PER_CHANNEL = 25;

/** Stable public messages only. Provider bodies, tokens and database errors stay private. */
const ISSUES: Record<SyncIssueCode, string> = {
  publication_read_failed: "Não foi possível consultar as publicações recentes deste canal.",
  authorization_unavailable:
    "Não foi possível confirmar uma autorização válida. Consulte os avisos do canal.",
  rate_limited: "O provedor limitou a coleta. As publicações restantes não foram medidas.",
  provider_unauthorized:
    "O provedor recusou a credencial usada nesta coleta. Atualize o canal antes de tentar novamente.",
  authorization_record_failed:
    "Falha de autenticação; não foi possível confirmar o estado da autorização no banco.",
  collection_failed: "Não foi possível obter métricas de uma ou mais publicações deste canal.",
  invalid_metrics: "O provedor retornou métricas inválidas; esses valores não foram gravados.",
  additional_metrics_unavailable:
    "A coleta da publicação foi obtida, mas parte das métricas adicionais não ficou disponível.",
  persistence_unconfirmed:
    "Não foi possível confirmar a gravação da coleta. Ela não foi repetida automaticamente; atualize os dados antes de tentar novamente.",
  authorization_changed:
    "A autorização mudou durante a coleta. A observação antiga foi recusada; atualize o canal.",
  publication_changed:
    "A publicação mudou ou não está mais disponível. A observação foi recusada; atualize os dados.",
};

interface ChannelRow {
  id: string;
  workspace_id: string;
  platform: string;
  external_id: string | null;
  metadata: Record<string, unknown> | null;
  status: string;
}
interface JobRow {
  id: string;
  channel_id: string;
  content_id: string;
  external_post_id: string | null;
  scheduled_at: string | null;
  workspace_id: string;
}
type ChannelResult = Pick<
  SyncSummary,
  "postsMeasured" | "postsUnavailable" | "snapshotsWritten"
> & {
  skipped?: { code: "unsupported" | "no_publications" | "unavailable"; reason: string };
  issues: Map<SyncIssueCode, number>;
};

async function syncChannel(channel: ChannelRow, lookbackDays: number): Promise<ChannelResult> {
  const result: ChannelResult = {
    postsMeasured: 0,
    postsUnavailable: 0,
    snapshotsWritten: 0,
    issues: new Map(),
  };
  const issue = (code: SyncIssueCode) =>
    result.issues.set(code, (result.issues.get(code) ?? 0) + 1);
  const collect = collectorFor(channel.platform);
  if (!collect) {
    result.skipped = { code: "unsupported", reason: "Coleta por publicação indisponível." };
    return result;
  }

  let rows: JobRow[];
  try {
    const since = new Date(Date.now() - lookbackDays * 86400_000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("scheduler_jobs")
      .select("id, channel_id, content_id, external_post_id, scheduled_at, workspace_id")
      .eq("workspace_id", channel.workspace_id)
      .eq("channel_id", channel.id)
      .eq("status", "succeeded")
      .not("external_post_id", "is", null)
      .not("external_post_id", "like", "sim\\_%")
      .gte("scheduled_at", since)
      .order("scheduled_at", { ascending: false })
      .limit(MAX_POSTS_PER_CHANNEL);
    if (error || !Array.isArray(data)) {
      issue("publication_read_failed");
      return result;
    }
    rows = data as JobRow[];
  } catch {
    issue("publication_read_failed");
    return result;
  }
  if (rows.length === 0) {
    result.skipped = { code: "no_publications", reason: "Nenhuma publicação efetiva recente." };
    return result;
  }

  let accessToken: string;
  let tokenVersion: string;
  try {
    const fresh = await getFreshToken(channel.id, channel.platform);
    accessToken = fresh.accessToken;
    tokenVersion = fresh.version;
  } catch {
    issue("authorization_unavailable");
    return result;
  }

  const seen = new Set<string>();
  for (const job of rows) {
    const postId = job.external_post_id;
    if (!postId || postId.startsWith("sim_") || seen.has(postId)) continue;
    seen.add(postId);

    let metrics;
    try {
      const observation = await collect({
        platform: channel.platform,
        externalPostId: postId,
        accessToken,
        channelConfig: channel.metadata ?? {},
        channelExternalId: channel.external_id,
      });
      if (!observation) {
        result.postsUnavailable += 1;
        continue;
      }
      metrics = observationMetrics(observation.metrics, observation.accountFollowers);
      if (!metrics) {
        issue("invalid_metrics");
        continue;
      }
      if (observation.warnings?.includes("additional_metrics_unavailable")) {
        issue("additional_metrics_unavailable");
      }
    } catch (error) {
      if (error instanceof InsightRateLimitError) {
        issue("rate_limited");
        return result;
      }
      if (error instanceof InsightAuthError) {
        try {
          await invalidateTokenVersion(channel.id, tokenVersion, "provider_unauthorized");
          issue("provider_unauthorized");
        } catch {
          issue("authorization_record_failed");
        }
        return result;
      }
      // Do not log upstream messages, post URLs, or bodies that may contain credentials.
      issue(error instanceof InsightMetricsError ? "invalid_metrics" : "collection_failed");
      continue;
    }
    result.postsMeasured += 1;

    try {
      const { data, error } = await supabaseAdmin.rpc("commit_analytics_observation", {
        _channel_id: channel.id,
        _expected_version: tokenVersion,
        _job_id: job.id,
        _external_post_id: postId,
        _metrics: { ...metrics },
      });
      if (!error && hasObservationReceipt(data)) {
        result.snapshotsWritten += 1;
        continue;
      }
      const reason =
        data && typeof data === "object" && !Array.isArray(data) && data.accepted === false
          ? data.reason
          : null;
      issue(
        !error && reason === "authorization_changed"
          ? "authorization_changed"
          : !error && reason === "publication_changed"
            ? "publication_changed"
            : "persistence_unconfirmed",
      );
    } catch {
      // The commit may have happened. Do not retry or manufacture a local acknowledgement.
      issue("persistence_unconfirmed");
    }
    // Stop this channel on an authorization/publication change or an unconfirmed save.
    return result;
  }
  if (result.postsUnavailable > 0) {
    result.skipped = {
      code: "unavailable",
      reason: "Uma ou mais publicações não retornaram observações; nenhum zero foi inventado.",
    };
  }
  return result;
}

/** Manual runs are workspace-scoped; only trusted cron code may omit workspaceId. */
export async function runAnalyticsSync(
  opts: { workspaceId?: string; lookbackDays?: number; maxChannels?: number } = {},
): Promise<SyncSummary> {
  const started = Date.now();
  const lookbackDays = opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const limit = opts.maxChannels ?? 50;
  if (
    !Number.isInteger(lookbackDays) ||
    lookbackDays < 1 ||
    lookbackDays > 180 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50
  ) {
    throw new Error("Parâmetros de coleta inválidos.");
  }
  let channels: ChannelRow[];
  try {
    let query = supabaseAdmin
      .from("channels")
      .select("id, workspace_id, platform, external_id, metadata, status")
      .eq("status", "connected")
      .limit(limit);
    if (opts.workspaceId) query = query.eq("workspace_id", opts.workspaceId);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new Error("unconfirmed read");
    channels = data as ChannelRow[];
  } catch {
    throw new Error("Não foi possível consultar os canais para a coleta de métricas.");
  }

  const summary: SyncSummary = {
    channelsConsidered: channels.length,
    channelsSynced: 0,
    postsMeasured: 0,
    postsUnavailable: 0,
    snapshotsWritten: 0,
    skipped: [],
    errors: [],
    durationMs: 0,
  };
  for (const channel of channels) {
    const result = await syncChannel(channel, lookbackDays);
    if (result.skipped) {
      summary.skipped.push({
        channelId: channel.id,
        platform: channel.platform,
        ...result.skipped,
      });
    }
    for (const [code, count] of result.issues) {
      summary.errors.push({
        channelId: channel.id,
        platform: channel.platform,
        code,
        error: ISSUES[code],
        count,
      });
    }
    if (result.snapshotsWritten > 0) summary.channelsSynced += 1;
    summary.postsMeasured += result.postsMeasured;
    summary.postsUnavailable += result.postsUnavailable;
    summary.snapshotsWritten += result.snapshotsWritten;
  }
  summary.durationMs = Date.now() - started;
  return summary;
}

export { precheckMedia };
