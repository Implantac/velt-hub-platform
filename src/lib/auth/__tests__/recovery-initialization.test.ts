import { describe, expect, it, vi } from "vitest";
import { createRecoverySession } from "../recovery-session";

type Dependencies = Parameters<typeof createRecoverySession>[1];
const user = { id: "test-initialization-user", email: "init@example.invalid" };
function setup(recovery = true) {
  const dependencies: Dependencies = {
    getUser: vi.fn(),
    onChange: vi.fn(),
    onAuthenticated: vi.fn(),
    onCallbackSettled: vi.fn(),
  };
  return {
    dependencies,
    session: createRecoverySession({ recovery, rejected: false }, dependencies),
  };
}

describe("SDK initialization errors are not hidden as missing sessions", () => {
  it("preserves callback material for a fresh initialization after a transient failure", async () => {
    const { dependencies, session } = setup();
    vi.mocked(dependencies.getUser).mockResolvedValue({
      data: { user: null },
      error: { status: 503 },
      initializationError: true,
    });
    expect(await session.check()).toEqual({ status: "unavailable" });
    expect(dependencies.onCallbackSettled).not.toHaveBeenCalled();
    expect(session.isCurrentUser(user.id)).toBe(false);
    session.dispose();
  });
  it.each([
    "AuthImplicitGrantRedirectError",
    "AuthPKCECodeVerifierMissingError",
    "AuthPKCEGrantCodeExchangeError",
  ])("rejects %s without rendering its raw message", async (name) => {
    const { dependencies, session } = setup();
    vi.mocked(dependencies.getUser).mockResolvedValue({
      data: { user: null },
      error: { name, status: 500, message: "test-only-raw-error" },
      initializationError: true,
    });
    expect(await session.check()).toEqual({ status: "invalid" });
    expect(dependencies.onCallbackSettled).toHaveBeenCalledWith({ recovery: true, rejected: true });
    session.dispose();
  });
  it("normalizes a failed session check so a reload cannot inherit an unrelated session", async () => {
    const { dependencies, session } = setup();
    vi.mocked(dependencies.getUser).mockResolvedValue({
      data: { user: null },
      error: { name: "AuthSessionMissingError" },
    });
    await session.check();
    expect(dependencies.onCallbackSettled).toHaveBeenCalledWith({ recovery: true, rejected: true });
    session.dispose();
  });
  it("does not let a sign-out be overwritten by an earlier normal-login read", async () => {
    const { dependencies, session } = setup(false);
    let resolve!: (result: Awaited<ReturnType<Dependencies["getUser"]>>) => void;
    vi.mocked(dependencies.getUser).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const check = session.check();
    session.onAuthEvent("SIGNED_OUT", null);
    resolve({ data: { user }, error: null });
    await check;
    expect(dependencies.onAuthenticated).not.toHaveBeenCalled();
    session.dispose();
  });
  it("handles a malformed rejection without crashing the recovery screen", async () => {
    const { dependencies, session } = setup();
    const error = {
      get status() {
        throw new Error("test-only getter");
      },
    };
    vi.mocked(dependencies.getUser).mockResolvedValue({ data: { user: null }, error });
    expect(await session.check()).toEqual({ status: "unavailable" });
    session.dispose();
  });
});
