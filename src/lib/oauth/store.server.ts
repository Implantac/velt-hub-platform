/**
 * Server-only, read-through credential store. There is deliberately no generic
 * save/upsert/delete API: writes are fenced in the database lifecycle RPCs.
 */
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { decryptToken } from "./crypto.server";
import { OAuthCredentialError } from "./errors.server";

export type OAuthPlatform = Database["public"]["Enums"]["social_platform"];
export interface StoredToken {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  scope: string | null;
  expiresAt: string | null;
  version: string;
  refreshLease: string | null;
  refreshLockedUntil: string | null;
  refreshStartedAt: string | null;
  refreshRetryAfter: string | null;
  refreshUncertain: boolean;
}
const uuid = z.string().uuid();
export async function getToken(
  channelId: string,
  platform: OAuthPlatform,
): Promise<StoredToken | null> {
  let row;
  try {
    const { data, error } = await supabaseAdmin.rpc("read_connected_oauth_token", {
      _channel_id: channelId,
      _platform: platform,
    });
    if (error) throw new Error("read failed");
    row = data;
    if (!row?.channel_id) return null;
    if (row.channel_id !== channelId || !uuid.safeParse(row.token_version).success)
      throw new Error("credential context mismatch");
  } catch {
    throw new OAuthCredentialError("store_unavailable", true);
  }
  const key = process.env.OAUTH_TOKEN_ENC_KEY;
  if (!key || Buffer.from(key, "base64").length !== 32)
    throw new OAuthCredentialError("store_unavailable", true);
  try {
    return {
      accessToken: decryptToken(row.access_token_ciphertext),
      refreshToken: row.refresh_token_ciphertext
        ? decryptToken(row.refresh_token_ciphertext)
        : null,
      tokenType: row.token_type,
      scope: row.scope,
      expiresAt: row.expires_at,
      version: row.token_version,
      refreshLease: row.refresh_lease,
      refreshLockedUntil: row.refresh_locked_until,
      refreshStartedAt: row.refresh_started_at,
      refreshRetryAfter: row.refresh_retry_after,
      refreshUncertain: row.refresh_uncertain,
    };
  } catch {
    await invalidateTokenVersion(channelId, row.token_version, "invalid_token");
    throw new OAuthCredentialError("invalid_token", false);
  }
}

export async function invalidateTokenVersion(
  channelId: string,
  version: string,
  issue: "provider_unauthorized" | "invalid_token" | "missing_refresh",
): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc("invalidate_oauth_token_version", {
      _channel_id: channelId,
      _expected_version: version,
      _issue: issue,
    });
    if (error || typeof data !== "boolean") throw new Error("unconfirmed invalidation");
    return data;
  } catch {
    throw new OAuthCredentialError("store_unavailable", true);
  }
}
