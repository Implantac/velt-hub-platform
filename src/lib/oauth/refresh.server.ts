/**
 * Server-only credential lifecycle. No in-memory lock and no credential UPSERT.
 * The database lease works across workers; begin is acknowledged before POST.
 * A rotated grant is never blindly retried after a timeout or lost response.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getToken,
  invalidateTokenVersion,
  type OAuthPlatform,
  type StoredToken,
} from "./store.server";
import { encryptToken } from "./crypto.server";
import { OAuthCredentialError } from "./errors.server";
import {
  parseOAuthTokens,
  readOAuthJson,
  record,
  validToken,
  type ParsedOAuthTokens,
} from "./token-response.server";

const EXPIRY_SKEW_MS = 5 * 60_000;
const supported = new Set([
  "youtube",
  "google_business",
  "linkedin",
  "tiktok",
  "facebook",
  "instagram",
]);
export function needsRefresh(expiresAt?: string | null, now = Date.now()): boolean {
  if (expiresAt == null) return false; // e.g. a Page grant with no stated lifetime
  const time = Date.parse(expiresAt);
  return !Number.isFinite(time) || time - EXPIRY_SKEW_MS <= now;
}
export interface FreshToken {
  accessToken: string;
  refreshed: boolean;
  version: string;
}
type RefreshOutcome =
  "not_sent" | "throttled" | "rejected" | "uncertain" | "invalid_grant" | "invalid_response";
class GrantError extends Error {
  constructor(public readonly outcome: RefreshOutcome) {
    super("OAuth refresh was not confirmed");
  }
}

function refreshRequest(platform: string, refreshToken: string) {
  const google = platform === "youtube" || platform === "google_business";
  const prefix = google ? "GOOGLE" : platform === "linkedin" ? "LINKEDIN" : "TIKTOK";
  const clientId = process.env[prefix + (platform === "tiktok" ? "_CLIENT_KEY" : "_CLIENT_ID")];
  const clientSecret = process.env[prefix + "_CLIENT_SECRET"];
  if (!clientId?.trim() || !clientSecret?.trim())
    throw new OAuthCredentialError("provider_configuration", true);
  return {
    url: google
      ? "https://oauth2.googleapis.com/token"
      : platform === "linkedin"
        ? "https://www.linkedin.com/oauth/v2/accessToken"
        : "https://open.tiktokapis.com/v2/oauth/token/",
    body: new URLSearchParams({
      [platform === "tiktok" ? "client_key" : "client_id"]: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  };
}
function providerFailure(json: Record<string, unknown>): RefreshOutcome | null {
  if (!json.error && !json.error_description) return null;
  // A contradictory body is not proof that a rotating grant was refused.
  if (json.access_token || json.refresh_token || json.data) return "invalid_response";
  const code = typeof json.error === "string" ? json.error : "";
  if (["invalid_grant", "access_denied"].includes(code)) return "invalid_grant";
  if (
    [
      "invalid_client",
      "unauthorized_client",
      "invalid_scope",
      "unsupported_grant_type",
      "invalid_request",
    ].includes(code)
  )
    return "rejected";
  return "uncertain";
}
async function sendRefresh(
  request: ReturnType<typeof refreshRequest>,
  platform: string,
): Promise<ParsedOAuthTokens> {
  let response: Response;
  try {
    response = await fetch(request.url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: request.body.toString(),
    });
  } catch {
    throw new GrantError("uncertain");
  }
  if (response.status === 429) {
    await response.body?.cancel().catch(() => {});
    throw new GrantError("throttled");
  }
  if (response.status >= 500) {
    await response.body?.cancel().catch(() => {});
    throw new GrantError("uncertain");
  }
  let json;
  try {
    json = record(await readOAuthJson(response));
  } catch {
    throw new GrantError(response.ok ? "invalid_response" : "uncertain");
  }
  const failure = providerFailure(json);
  if (failure) throw new GrantError(failure);
  if (!response.ok) throw new GrantError("uncertain");
  try {
    return parseOAuthTokens(json.data === undefined ? json : record(json.data), {
      expiryRequired: true,
      refreshRequired: platform === "tiktok",
    });
  } catch {
    throw new GrantError("invalid_response");
  }
}
async function release(
  channelId: string,
  version: string,
  lease: string,
  outcome: RefreshOutcome,
): Promise<void> {
  try {
    await supabaseAdmin.rpc("fail_oauth_token_refresh", {
      _channel_id: channelId,
      _expected_version: version,
      _lease: lease,
      _outcome: outcome,
    });
  } catch {
    // No second grant. An abandoned begun lease becomes uncertain at expiry.
  }
}
const claimSchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("claimed"),
    channel_id: z.string().uuid(),
    token_version: z.string().uuid(),
    lease: z.string().uuid(),
  }),
  z.object({ state: z.enum(["disconnected", "changed", "busy", "cooldown", "reconnect"]) }),
]);

async function commitRefresh(
  channelId: string,
  platform: OAuthPlatform,
  stored: StoredToken,
  lease: string,
  result: ParsedOAuthTokens,
): Promise<FreshToken> {
  const newVersion = randomUUID();
  let args;
  try {
    args = {
      _channel_id: channelId,
      _expected_version: stored.version,
      _lease: lease,
      _new_version: newVersion,
      _access_ciphertext: encryptToken(result.accessToken),
      _refresh_ciphertext: encryptToken(result.refreshToken ?? stored.refreshToken!),
      _expires_at: result.expiresAt!,
      _scope: result.scope ?? stored.scope,
      _token_type: result.tokenType ?? stored.tokenType ?? "Bearer",
    };
  } catch {
    await release(channelId, stored.version, lease, "uncertain");
    throw new OAuthCredentialError("refresh_uncertain", false);
  }
  // Retrying this CAS once is safe. Retrying the provider's rotating grant is NOT.
  for (let attempt = 0; attempt < 2; attempt++) {
    let acknowledged = false;
    try {
      const { data, error } = await supabaseAdmin.rpc("complete_oauth_token_refresh", args);
      acknowledged = !error && data === true;
    } catch {
      // The known new version is the receipt used to resolve a lost acknowledgement.
    }
    let current;
    try {
      current = await getToken(channelId, platform);
    } catch {
      if (acknowledged) throw new OAuthCredentialError("store_unavailable", true);
      await release(channelId, stored.version, lease, "uncertain");
      throw new OAuthCredentialError("refresh_uncertain", false);
    }
    if (!current) throw new OAuthCredentialError("disconnected", false);
    if (
      current.version === newVersion &&
      current.accessToken === result.accessToken &&
      !current.refreshUncertain
    )
      return { accessToken: current.accessToken, version: newVersion, refreshed: true };
    if (current.version !== stored.version)
      throw new OAuthCredentialError("credential_changed", true);
    if (current.refreshLease !== lease || current.refreshUncertain) break;
  }
  await release(channelId, stored.version, lease, "uncertain");
  throw new OAuthCredentialError("refresh_uncertain", false);
}

export async function getFreshToken(channelId: string, platformName: string): Promise<FreshToken> {
  if (!supported.has(platformName)) throw new OAuthCredentialError("disconnected", false);
  const platform = platformName as OAuthPlatform;
  for (let read = 0; read < 2; read++) {
    const stored = await getToken(channelId, platform);
    if (!stored) throw new OAuthCredentialError("disconnected", false);
    if (
      !validToken(stored.accessToken) ||
      (stored.expiresAt !== null && !Number.isFinite(Date.parse(stored.expiresAt)))
    ) {
      await invalidateTokenVersion(channelId, stored.version, "invalid_token");
      throw new OAuthCredentialError("invalid_token", false);
    }
    if (stored.refreshUncertain) throw new OAuthCredentialError("refresh_uncertain", false);
    const canRefresh = ["youtube", "google_business", "linkedin", "tiktok"].includes(platform);
    const expiresUnknown = stored.expiresAt === null && canRefresh;
    if (!expiresUnknown && !needsRefresh(stored.expiresAt) && !stored.refreshStartedAt)
      return { accessToken: stored.accessToken, refreshed: false, version: stored.version };
    if (!canRefresh || !validToken(stored.refreshToken)) {
      await invalidateTokenVersion(channelId, stored.version, "missing_refresh");
      throw new OAuthCredentialError("missing_refresh", false);
    }
    // Configuration errors are known before reserving/beginning any external grant.
    const request = refreshRequest(platform, stored.refreshToken);
    let claim;
    try {
      const { data, error } = await supabaseAdmin.rpc("claim_oauth_token_refresh", {
        _channel_id: channelId,
        _platform: platform,
        _expected_version: stored.version,
      });
      if (error) throw new Error("claim not confirmed");
      claim = claimSchema.parse(data);
    } catch {
      throw new OAuthCredentialError("store_unavailable", true);
    }
    if (claim.state === "changed") continue;
    if (claim.state === "busy") throw new OAuthCredentialError("refresh_busy", true);
    if (claim.state === "cooldown") throw new OAuthCredentialError("refresh_cooldown", true);
    if (claim.state === "disconnected") throw new OAuthCredentialError("disconnected", false);
    if (claim.state === "reconnect") throw new OAuthCredentialError("refresh_uncertain", false);
    if (claim.state !== "claimed") throw new OAuthCredentialError("store_unavailable", true);
    if (claim.channel_id !== channelId || claim.token_version !== stored.version)
      throw new OAuthCredentialError("store_unavailable", true);
    let begun = false;
    try {
      const { data, error } = await supabaseAdmin.rpc("begin_oauth_token_refresh", {
        _channel_id: channelId,
        _expected_version: stored.version,
        _lease: claim.lease,
      });
      begun = !error && data === true;
    } catch {
      // No acknowledged begin means NO POST, even if the database actually began.
    }
    if (!begun) {
      await release(channelId, stored.version, claim.lease, "not_sent");
      throw new OAuthCredentialError("credential_changed", true);
    }
    let result;
    try {
      result = await sendRefresh(request, platform);
    } catch (error) {
      const outcome = error instanceof GrantError ? error.outcome : "uncertain";
      await release(channelId, stored.version, claim.lease, outcome);
      if (outcome === "throttled") throw new OAuthCredentialError("refresh_cooldown", true);
      if (outcome === "rejected") throw new OAuthCredentialError("provider_configuration", true);
      if (outcome === "invalid_grant") throw new OAuthCredentialError("invalid_grant", false);
      if (outcome === "invalid_response") throw new OAuthCredentialError("invalid_token", false);
      throw new OAuthCredentialError("refresh_uncertain", false);
    }
    return commitRefresh(channelId, platform, stored, claim.lease, result);
  }
  throw new OAuthCredentialError("credential_changed", true);
}
