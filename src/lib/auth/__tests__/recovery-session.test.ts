import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_SESSION_TIMEOUT_MS,
  cleanLoginCallbackPath,
  createRecoverySession,
  loginCallbackIntent,
  type RecoveryState,
} from "../recovery-session";

const user = { id: "test-user-a", email: "recovery@example.invalid" };
const other = { id: "test-user-b", email: "other@example.invalid" };
const valid = { data: { user }, error: null };
const missing = { data: { user: null }, error: { name: "AuthSessionMissingError" } };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function harness(recovery = true, rejected = false) {
  const changes: RecoveryState[] = [];
  const dependencies = {
    getUser: vi.fn(async () => valid as { data: { user: typeof user | null }; error: unknown }),
    onChange: vi.fn((state: RecoveryState) => changes.push(state)),
    onAuthenticated: vi.fn(),
    onCallbackSettled: vi.fn(),
  };
  const controller = createRecoverySession({ recovery, rejected }, dependencies);
  return { ...dependencies, controller, changes };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("login callback intent and cleanup", () => {
  it.each([
    ["?mode=reset", "", true, false],
    ["", "#type=recovery&access_token=test-only", true, false],
    ["?mode=reset", "#error=access_denied&error_description=never-display", true, true],
    ["?mode=reset&error_code=otp_expired", "", true, true],
    ["?mode=reset&auth_error=invalid_link", "", true, true],
    ["?mode=unknown", "#note=type=recovery", false, false],
    ["", "#access_token=type%3Drecovery", false, false],
    ["?code=test-only", "", false, false],
    ["?redirect=/app/content", "#composer", false, false],
  ])("reads only exact, non-sensitive intent: %s %s", (search, hash, recovery, rejected) => {
    expect(loginCallbackIntent(search, hash)).toEqual({ recovery, rejected });
  });
  it("does not rewrite an ordinary login/deep link", () => {
    expect(
      cleanLoginCallbackPath("/login?redirect=%2Fapp%2Fcontent%23composer#section"),
    ).toBeNull();
  });
  it("removes all callback material and keeps only an internal destination", () => {
    const result = cleanLoginCallbackPath(
      "https://velt.invalid/login?mode=reset&redirect=%2Fapp%2Fcontent%3Fx%3D1%23composer&code=test-only-code#access_token=test-only-access&refresh_token=test-only-refresh&provider_token=test-only-provider&expires_in=3600&type=recovery",
    );
    expect(result).toBe("/login?redirect=%2Fapp%2Fcontent%3Fx%3D1%23composer&mode=reset");
    expect(result).not.toContain("test-only");
  });
  it("retains a normalized rejection, never raw descriptions, on reload", () => {
    const result = cleanLoginCallbackPath(
      "/login?mode=reset&redirect=https%3A%2F%2Fevil.invalid#error=denied&error_code=otp_expired&error_description=secret-provider-message",
    );
    expect(result).toBe("/login?redirect=%2Fapp&mode=reset&auth_error=invalid_link");
    expect(loginCallbackIntent(new URL(result!, "https://velt.invalid").search, "")).toEqual({
      recovery: true,
      rejected: true,
    });
  });
  it("keeps recovery/rejection intent after the SDK has already removed the fragment", () => {
    expect(cleanLoginCallbackPath("/login", { recovery: true, rejected: false })).toBe(
      "/login?mode=reset",
    );
    expect(cleanLoginCallbackPath("/login", { recovery: true, rejected: true })).toBe(
      "/login?mode=reset&auth_error=invalid_link",
    );
  });
});

describe("confirmed recovery sessions", () => {
  it("does not treat mode=reset as a valid session", async () => {
    const h = harness();
    h.getUser.mockResolvedValue(missing);
    expect(await h.controller.check()).toEqual({ status: "invalid" });
    expect(h.controller.isCurrentUser(user.id)).toBe(false);
    expect(h.onAuthenticated).not.toHaveBeenCalled();
  });
  it("becomes ready only after the Auth read confirms the user", async () => {
    const h = harness();
    const pending = deferred<typeof valid>();
    h.getUser.mockReturnValue(pending.promise);
    const check = h.controller.check();
    expect(h.changes).toEqual([{ status: "checking" }]);
    expect(h.controller.isCurrentUser(user.id)).toBe(false);
    expect(h.onCallbackSettled).not.toHaveBeenCalled();
    pending.resolve(valid);
    expect(await check).toEqual({ status: "ready", user });
    expect(h.controller.isCurrentUser(user.id)).toBe(true);
    expect(h.controller.isCurrentUser(other.id)).toBe(false);
    expect(h.onCallbackSettled).toHaveBeenCalledTimes(1);
    expect(h.onAuthenticated).not.toHaveBeenCalled();
  });
  it.each([
    { name: "AuthSessionMissingError" },
    { status: 400 },
    { status: 401 },
    { status: 403 },
    { code: "session_not_found" },
    { code: "bad_jwt" },
    { code: "refresh_token_not_found" },
    { code: "refresh_token_already_used" },
  ])("classifies an invalid session without raw provider text: %j", async (error) => {
    const h = harness();
    h.getUser.mockResolvedValue({ data: { user: null }, error });
    expect(await h.controller.check()).toEqual({ status: "invalid" });
    expect(h.controller.isCurrentUser(user.id)).toBe(false);
  });
  it.each([
    { status: 500 },
    { status: 503 },
    { status: 429 },
    new TypeError("Failed to fetch"),
    "offline",
  ])("allows an explicit retry after a transient read failure: %j", async (error) => {
    const h = harness();
    h.getUser.mockResolvedValueOnce({ data: { user: null }, error });
    expect(await h.controller.check()).toEqual({ status: "unavailable" });
    expect(await h.controller.check()).toEqual({ status: "ready", user });
    expect(h.onAuthenticated).not.toHaveBeenCalled();
  });
  it("does not accept a user when the same response also has an error", async () => {
    const h = harness();
    h.getUser.mockResolvedValue({ data: { user }, error: { status: 503 } });
    expect(await h.controller.check()).toEqual({ status: "unavailable" });
    expect(h.controller.isCurrentUser(user.id)).toBe(false);
  });
  it("rejects a callback error even if another session already exists", async () => {
    const h = harness(true, true);
    expect(await h.controller.check()).toEqual({ status: "invalid" });
    h.controller.onAuthEvent("SIGNED_IN", user);
    expect(h.onAuthenticated).not.toHaveBeenCalled();
    expect(h.controller.isCurrentUser(user.id)).toBe(false);
  });
  it("does not spin forever or strip an unconsumed code when Auth hangs", async () => {
    vi.useFakeTimers();
    const h = harness();
    const pending = deferred<typeof valid>();
    h.getUser.mockReturnValueOnce(pending.promise);
    const check = h.controller.check();
    await vi.advanceTimersByTimeAsync(AUTH_SESSION_TIMEOUT_MS);
    expect(await check).toEqual({ status: "unavailable" });
    expect(h.onCallbackSettled).not.toHaveBeenCalled();
    pending.resolve(valid);
    await Promise.resolve();
    expect(h.controller.isCurrentUser(user.id)).toBe(false);
    expect(await h.controller.check()).toEqual({ status: "ready", user });
    expect(h.onCallbackSettled).toHaveBeenCalledTimes(1);
  });
  it("deduplicates automatic normal-login navigation", async () => {
    const h = harness(false);
    h.controller.onAuthEvent("SIGNED_IN", user);
    await h.controller.check();
    h.controller.onAuthEvent("SIGNED_IN", user);
    expect(h.onAuthenticated).toHaveBeenCalledTimes(1);
    expect(h.changes).toEqual([]);
  });
  it("keeps normal login usable with no existing session", async () => {
    const h = harness(false);
    h.getUser.mockResolvedValue(missing);
    expect(await h.controller.check()).toEqual({ status: "idle" });
    expect(h.onAuthenticated).not.toHaveBeenCalled();
  });
});

describe("recovery interleavings", () => {
  it("defers SDK work outside PASSWORD_RECOVERY and never redirects to the app", async () => {
    vi.useFakeTimers();
    const h = harness(false);
    h.controller.onAuthEvent("PASSWORD_RECOVERY", user);
    expect(h.getUser).not.toHaveBeenCalled();
    expect(h.controller.isCurrentUser(user.id)).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.getUser).toHaveBeenCalledTimes(1);
    expect(h.controller.isCurrentUser(user.id)).toBe(true);
    expect(h.onAuthenticated).not.toHaveBeenCalled();
  });
  it("discards a late read from before a new check", async () => {
    const h = harness();
    const pending = deferred<typeof missing>();
    h.getUser.mockReturnValueOnce(pending.promise);
    const first = h.controller.check();
    await h.controller.check();
    pending.resolve(missing);
    await first;
    expect(h.changes.at(-1)).toEqual({ status: "ready", user });
    expect(h.controller.isCurrentUser(user.id)).toBe(true);
  });
  it("a sign-out wins over an already pending revalidation", async () => {
    const h = harness();
    await h.controller.check();
    const pending = deferred<typeof valid>();
    h.getUser.mockReturnValueOnce(pending.promise);
    const check = h.controller.check();
    h.controller.onAuthEvent("SIGNED_OUT", null);
    pending.resolve(valid);
    await check;
    expect(h.changes.at(-1)).toEqual({ status: "invalid" });
    expect(h.controller.isCurrentUser(user.id)).toBe(false);
    expect(await h.controller.check()).toEqual({ status: "invalid" });
  });
  it.each(["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED", "INITIAL_SESSION"] as const)(
    "a different account in %s cannot inherit the reset form",
    async (event) => {
      const h = harness();
      await h.controller.check();
      h.controller.onAuthEvent(event, other);
      expect(h.changes.at(-1)).toEqual({ status: "invalid" });
      expect(h.controller.isCurrentUser(user.id)).toBe(false);
      expect(h.controller.isCurrentUser(other.id)).toBe(false);
      expect(h.onAuthenticated).not.toHaveBeenCalled();
    },
  );
  it("remembers the SDK identity before the initial server read returns", async () => {
    const h = harness();
    const pending = deferred<typeof valid>();
    h.getUser.mockReturnValueOnce(pending.promise);
    const check = h.controller.check();
    h.controller.onAuthEvent("INITIAL_SESSION", user);
    h.controller.onAuthEvent("SIGNED_IN", other);
    pending.resolve(valid);
    await check;
    expect(h.changes.at(-1)).toEqual({ status: "invalid" });
  });
  it("rejects a different user returned by revalidation", async () => {
    const h = harness();
    await h.controller.check();
    h.getUser.mockResolvedValueOnce({ data: { user: other }, error: null });
    expect(await h.controller.check()).toEqual({ status: "invalid" });
    expect(h.controller.isCurrentUser(other.id)).toBe(false);
  });
  it("same-user refreshes and USER_UPDATED do not turn recovery into normal login", async () => {
    const h = harness();
    await h.controller.check();
    h.controller.onAuthEvent("USER_UPDATED", user);
    h.controller.onAuthEvent("TOKEN_REFRESHED", user);
    expect(h.controller.isCurrentUser(user.id)).toBe(true);
    expect(h.onAuthenticated).not.toHaveBeenCalled();
  });
  it("an explicit invalidation cannot be reopened by a late recovery event", async () => {
    vi.useFakeTimers();
    const h = harness();
    await h.controller.check();
    h.controller.invalidate();
    h.controller.onAuthEvent("PASSWORD_RECOVERY", user);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.changes.at(-1)).toEqual({ status: "invalid" });
    expect(h.controller.isCurrentUser(user.id)).toBe(false);
  });
  it("ignores completion, navigation and callbacks after disposal", async () => {
    const h = harness();
    const pending = deferred<typeof valid>();
    h.getUser.mockReturnValueOnce(pending.promise);
    const check = h.controller.check();
    h.controller.dispose();
    const count = h.changes.length;
    pending.resolve(valid);
    await check;
    h.controller.onAuthEvent("SIGNED_IN", user);
    await h.controller.check();
    expect(h.changes).toHaveLength(count);
    expect(h.onAuthenticated).not.toHaveBeenCalled();
    expect(h.onCallbackSettled).not.toHaveBeenCalled();
    expect(h.controller.isCurrentUser(user.id)).toBe(false);
  });
  it("does not run deferred Auth reads after disposal", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.controller.onAuthEvent("PASSWORD_RECOVERY", user);
    h.controller.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.getUser).not.toHaveBeenCalled();
  });
});
