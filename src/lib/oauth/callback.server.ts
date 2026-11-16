import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireWorkspaceRole, assertBrandInWorkspace } from "@/lib/api/_workspace";
import { WORKSPACE_MANAGE_ROLES } from "@/lib/workspace/permissions";
import { getProvider, ProviderConnectionError, type ProviderTokens } from "./providers.server";
import { encryptToken } from "./crypto.server";
import { MAX_TOKEN_SECONDS, validToken } from "./token-response.server";
import {
  verifyState,
  stateCookieName,
  stateCookieValue,
  stateMatchesCookie,
  STATE_COOKIE_PATH,
} from "./state.server";

const safeMetadataKeys = new Set([
  "page_id",
  "ig_user_id",
  "person_id",
  "account_id",
  "location_id",
  "location_name",
  "address",
  "requires_location_selection",
  "location_confirmed",
]);
function checkedTokens(tokens: ProviderTokens, platform: string): ProviderTokens {
  if (
    !tokens ||
    !validToken(tokens.accessToken) ||
    (tokens.refreshToken !== undefined && !validToken(tokens.refreshToken)) ||
    typeof tokens.externalAccountId !== "string" ||
    !tokens.externalAccountId.trim() ||
    tokens.externalAccountId.length > 300 ||
    /\p{Cc}/u.test(tokens.externalAccountId) ||
    (tokens.externalHandle !== undefined &&
      (typeof tokens.externalHandle !== "string" ||
        tokens.externalHandle.length > 500 ||
        /\p{Cc}/u.test(tokens.externalHandle))) ||
    (tokens.tokenType !== undefined && !/^Bearer$/i.test(tokens.tokenType)) ||
    (tokens.scope !== undefined &&
      (typeof tokens.scope !== "string" ||
        tokens.scope.length > 8192 ||
        /\p{Cc}/u.test(tokens.scope)))
  )
    throw new Error("Invalid provider credential or identity");
  if (tokens.expiresAt !== undefined) {
    const expiry = Date.parse(tokens.expiresAt);
    if (
      !z.iso.datetime().safeParse(tokens.expiresAt).success ||
      !Number.isFinite(expiry) ||
      expiry <= Date.now() ||
      expiry > Date.now() + MAX_TOKEN_SECONDS * 1000 + 1000
    )
      throw new Error("Invalid provider expiration");
  } else if (!["facebook", "instagram"].includes(platform))
    throw new Error("Provider expiration is required");
  if (
    tokens.metadata !== undefined &&
    (!tokens.metadata ||
      Array.isArray(tokens.metadata) ||
      typeof tokens.metadata !== "object" ||
      Object.entries(tokens.metadata).some(
        ([key, value]) =>
          !safeMetadataKeys.has(key) ||
          (value !== null &&
            typeof value !== "boolean" &&
            (typeof value !== "string" || value.length > 1000 || /\p{Cc}/u.test(value))),
      ))
  )
    throw new Error("Invalid public provider metadata");
  return tokens;
}

/** Browser validation -> atomic single-use consume -> exchange -> fenced commit. */
export async function handleOAuthCallback(request: Request, providerId: string): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  let payload;
  let cookieName: string;
  try {
    cookieName = stateCookieName(providerId);
    if (!state || url.searchParams.getAll("state").length !== 1)
      throw new Error("Missing OAuth state");
    payload = verifyState(state);
    const cookie = request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    if (payload.provider !== providerId || !stateMatchesCookie(state, cookie))
      throw new Error("OAuth state/browser mismatch");
    const expected = new URL(payload.redirectUri);
    if (
      expected.pathname !== `/api/public/oauth/callback/${providerId}` ||
      expected.search ||
      expected.hash ||
      (process.env.APP_ORIGIN && expected.origin !== new URL(process.env.APP_ORIGIN).origin) ||
      (process.env.NODE_ENV === "production" && !process.env.APP_ORIGIN)
    )
      throw new Error("OAuth callback origin mismatch");
  } catch {
    return new Response("Não foi possível validar esta autorização. Inicie novamente em Canais.", {
      status: 400,
      headers: {
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }
  const origin = new URL(payload.redirectUri).origin;
  const redirect = (key: string, value: string) => {
    const target = new URL("/app/channels", origin);
    target.searchParams.set(key, value);
    return new Response(null, {
      status: 302,
      headers: {
        Location: target.href,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Set-Cookie": `${cookieName}=; Path=${STATE_COOKIE_PATH}; Max-Age=0; HttpOnly; SameSite=Lax${origin.startsWith("https:") ? "; Secure" : ""}`,
      },
    });
  };
  let attempt: { id: string; exchange_token: string } | undefined;
  const fail = async (reason: "provider_denied" | "invalid_response" | "exchange_failed") => {
    if (!attempt) return;
    try {
      await supabaseAdmin.rpc("fail_oauth_authorization", {
        _attempt_id: attempt.id,
        _exchange_token: attempt.exchange_token,
        _reason: reason,
      });
    } catch {
      /* A lost failure acknowledgement never makes this intent reusable. */
    }
  };
  try {
    await requireWorkspaceRole(
      supabaseAdmin,
      payload.workspaceId,
      payload.userId,
      WORKSPACE_MANAGE_ROLES,
    );
    await assertBrandInWorkspace(supabaseAdmin, payload.workspaceId, payload.brandId ?? undefined);
    const provider = getProvider(providerId);
    const { data: consumed, error: consumeError } = await supabaseAdmin.rpc(
      "consume_oauth_authorization",
      {
        _state_hash: stateCookieValue(state),
        _workspace_id: payload.workspaceId,
        _actor_id: payload.userId,
        _provider: providerId,
        _brand_id: payload.brandId ?? null,
        _channel_id: payload.channelId ?? null,
        _redirect_uri: payload.redirectUri,
      },
    );
    if (consumeError) throw new Error("Authorization consumption was not acknowledged");
    if (!consumed?.id) return redirect("oauth_error", "authorization_used");
    if (
      !z.string().uuid().safeParse(consumed.id).success ||
      !z.string().uuid().safeParse(consumed.exchange_token).success ||
      consumed.state !== "exchanging" ||
      consumed.platform !== provider.platform ||
      consumed.workspace_id !== payload.workspaceId ||
      consumed.actor_id !== payload.userId ||
      consumed.provider !== providerId ||
      (consumed.target_channel_id ?? null) !== (payload.channelId ?? null)
    )
      throw new Error("Authorization context was not confirmed");
    attempt = { id: consumed.id, exchange_token: z.string().uuid().parse(consumed.exchange_token) };
    if (url.searchParams.has("error")) {
      await fail("provider_denied");
      return redirect("oauth_error", "provider_denied");
    }
    const code = url.searchParams.get("code");
    if (!code || code.length > 8192 || url.searchParams.getAll("code").length !== 1) {
      await fail("invalid_response");
      return redirect("oauth_error", "connection_failed");
    }
    const tokens = checkedTokens(
      await provider.exchange({
        code,
        redirectUri: payload.redirectUri,
        targetExternalId: consumed.target_external_id ?? undefined,
      }),
      provider.platform,
    );
    if (consumed.target_external_id && tokens.externalAccountId !== consumed.target_external_id)
      throw new Error("Reauthorization returned another external identity");
    const { data: channel, error } = await supabaseAdmin.rpc("complete_oauth_authorization", {
      _attempt_id: attempt.id,
      _exchange_token: attempt.exchange_token,
      _external_id: tokens.externalAccountId!,
      _handle: tokens.externalHandle ?? null,
      _metadata: { ...(tokens.metadata ?? {}), provider: providerId, scope: tokens.scope ?? null },
      _access_ciphertext: encryptToken(tokens.accessToken),
      _refresh_ciphertext: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
      _token_type: tokens.tokenType ?? null,
      _scope: tokens.scope ?? null,
      _expires_at: tokens.expiresAt ?? null,
    });
    if (
      error ||
      !channel ||
      channel.workspace_id !== payload.workspaceId ||
      channel.platform !== provider.platform ||
      channel.external_id !== tokens.externalAccountId ||
      channel.status !== "connected" ||
      (payload.channelId && channel.id !== payload.channelId)
    )
      throw new Error("OAuth persistence was not confirmed");
    return redirect("oauth_connected", provider.platform);
  } catch (error) {
    await fail("exchange_failed");
    // Provider errors may contain credentials: neither log nor reflect their bodies.
    console.warn("[oauth/callback] authorization or connection failed; no success reported");
    return redirect(
      "oauth_error",
      error instanceof ProviderConnectionError &&
        ["account_selection_required", "no_eligible_account", "provider_unavailable"].includes(
          error.code,
        )
        ? error.code
        : "connection_failed",
    );
  }
}
