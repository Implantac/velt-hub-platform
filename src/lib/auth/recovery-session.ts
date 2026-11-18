import type { AuthChangeEvent } from "@supabase/supabase-js";
import { safeAppReturnTo } from "./return-to";

export const AUTH_SESSION_TIMEOUT_MS = 15_000;
const SESSION_TIMEOUT = Symbol("auth_session_timeout");

export type RecoveryUser = { id: string; email?: string };
export type RecoveryState =
  | { status: "idle" | "checking" | "invalid" | "unavailable" }
  | { status: "ready"; user: RecoveryUser };
export type LoginCallbackIntent = { recovery: boolean; rejected: boolean };

/** Read intent only. A URL flag or token-shaped string never proves a session. */
export function loginCallbackIntent(search: string, hash: string): LoginCallbackIntent {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  return {
    recovery: query.get("mode") === "reset" || fragment.get("type") === "recovery",
    rejected:
      query.get("auth_error") === "invalid_link" ||
      [query, fragment].some((params) => params.has("error") || params.has("error_code")),
  };
}

const CALLBACK_KEYS = [
  "access_token",
  "refresh_token",
  "provider_token",
  "provider_refresh_token",
  "token_hash",
  "token_type",
  "expires_in",
  "expires_at",
  "code",
  "type",
  "error",
  "error_code",
  "error_description",
];

/** Call only AFTER SDK initialization has settled, never before code exchange. */
export function cleanLoginCallbackPath(href: string, initial?: LoginCallbackIntent): string | null {
  const url = new URL(href, "https://velt.invalid");
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  if (
    !initial?.recovery &&
    !initial?.rejected &&
    !CALLBACK_KEYS.some((key) => url.searchParams.has(key) || fragment.has(key))
  )
    return null;
  const intent = loginCallbackIntent(url.search, url.hash);
  const query = new URLSearchParams();
  if (url.searchParams.has("redirect"))
    query.set("redirect", safeAppReturnTo(url.searchParams.get("redirect")));
  if (intent.recovery || initial?.recovery) query.set("mode", "reset");
  // Preserve a non-sensitive rejection marker across reloads, not provider text.
  if (intent.rejected || initial?.rejected) query.set("auth_error", "invalid_link");
  return `${url.pathname}${query.size ? `?${query}` : ""}`;
}

function invalidSession(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  try {
    const details = error as { name?: unknown; code?: unknown; status?: unknown };
    return (
      [
        "AuthSessionMissingError",
        "AuthImplicitGrantRedirectError",
        "AuthPKCECodeVerifierMissingError",
        "AuthPKCEGrantCodeExchangeError",
      ].includes(typeof details.name === "string" ? details.name : "") ||
      (typeof details.status === "number" && [400, 401, 403].includes(details.status)) ||
      (typeof details.code === "string" &&
        [
          "session_not_found",
          "bad_jwt",
          "refresh_token_not_found",
          "refresh_token_already_used",
        ].includes(details.code))
    );
  } catch {
    return false;
  }
}

type SessionResult = {
  data: { user: RecoveryUser | null };
  error: unknown;
  initializationError?: boolean;
};
type RecoveryDependencies = {
  getUser: () => Promise<SessionResult>;
  onChange: (state: RecoveryState) => void;
  onAuthenticated: () => void;
  onCallbackSettled: (intent: LoginCallbackIntent) => void;
};

/**
 * Read-only session controller. Generations discard late responses and a verified
 * identity cannot silently become another account while a reset form is open.
 * The Auth service, not this controller, authorizes the actual password change.
 */
export function createRecoverySession(
  intent: LoginCallbackIntent,
  dependencies: RecoveryDependencies,
) {
  let state: RecoveryState = { status: intent.recovery ? "checking" : "idle" };
  let recovering = intent.recovery;
  let rejected = intent.rejected;
  let expectedUserId: string | undefined;
  let generation = 0;
  let disposed = false;
  let navigated = false;

  function emit(next: RecoveryState) {
    if (disposed) return;
    state = next;
    dependencies.onChange(next);
  }
  function notifyAuthenticated() {
    if (!disposed && !navigated) {
      navigated = true;
      dependencies.onAuthenticated();
    }
  }
  function invalidate() {
    generation++;
    rejected = true;
    if (recovering) emit({ status: "invalid" });
  }

  async function check(): Promise<RecoveryState> {
    if (disposed) return state;
    const current = ++generation;
    if (recovering) emit({ status: "checking" });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let result: SessionResult;
    try {
      result = await Promise.race([
        dependencies.getUser(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(SESSION_TIMEOUT), AUTH_SESSION_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      result = { data: { user: null }, error };
    } finally {
      clearTimeout(timer);
    }
    if (disposed || current !== generation) return state;
    const transientInitialization =
      result.initializationError && result.error && !invalidSession(result.error) && !rejected;
    if (!recovering) {
      if (result.error !== SESSION_TIMEOUT && !transientInitialization)
        dependencies.onCallbackSettled({ recovery: false, rejected });
      if (!result.error && result.data.user) notifyAuthenticated();
      return state;
    }
    if (rejected) emit({ status: "invalid" });
    else if (result.error)
      emit({ status: invalidSession(result.error) ? "invalid" : "unavailable" });
    else if (!result.data.user) emit({ status: "invalid" });
    else if (expectedUserId && result.data.user.id !== expectedUserId) invalidate();
    else {
      expectedUserId = result.data.user.id;
      emit({ status: "ready", user: result.data.user });
    }
    // A hung or transiently failed URL exchange must keep its code for an explicit
    // fresh initialization. Never parse/replay tokens manually to bypass the SDK.
    if (result.error !== SESSION_TIMEOUT && !transientInitialization) {
      dependencies.onCallbackSettled({
        recovery: true,
        rejected: rejected || state.status === "invalid",
      });
    }
    return state;
  }

  function onAuthEvent(event: AuthChangeEvent, user: RecoveryUser | null) {
    if (disposed) return;
    if (event === "PASSWORD_RECOVERY") {
      recovering = true;
      if (expectedUserId && user?.id !== expectedUserId) {
        invalidate();
        return;
      }
      if (user) expectedUserId = user.id;
      generation++;
      emit({ status: "checking" });
      // Never await an SDK method inside its own auth lock/callback.
      setTimeout(() => {
        if (!disposed) void check();
      }, 0);
      return;
    }
    if (recovering) {
      if (event === "SIGNED_OUT" || (user && expectedUserId && user.id !== expectedUserId))
        invalidate();
      else if (user && !expectedUserId) expectedUserId = user.id;
      return;
    }
    if (event === "SIGNED_OUT") {
      generation++;
      return;
    }
    if (event === "SIGNED_IN" && user) notifyAuthenticated();
  }

  return {
    check,
    onAuthEvent,
    invalidate,
    isCurrentUser: (id: string) =>
      !disposed && !rejected && state.status === "ready" && state.user.id === id,
    dispose: () => {
      disposed = true;
      generation++;
    },
  };
}
