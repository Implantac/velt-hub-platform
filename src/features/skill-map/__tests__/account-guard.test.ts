import { describe, expect, it, vi } from "vitest";
import { skillAccountRequest } from "../account-guard";
import { uid, otherUser } from "@/lib/skill-map/__tests__/fixtures";

describe("Skill Map pre-RPC identity guard", () => {
  it("dispatches once only after confirming the expected session account", async () => {
    const call = vi.fn(async () => "confirmed");
    expect(
      await skillAccountRequest(
        uid,
        async () => ({ data: { session: { user: { id: uid } } }, error: null }),
        call,
      ),
    ).toBe("confirmed");
    expect(call).toHaveBeenCalledTimes(1);
  });
  it.for([
    { data: { session: null }, error: null },
    { data: { session: { user: { id: otherUser } } }, error: null },
    { data: { session: { user: { id: uid } } }, error: new Error("synthetic session error") },
  ])("does not dispatch an old/absent/unconfirmed identity", async (result) => {
    const call = vi.fn();
    await expect(skillAccountRequest(uid, async () => result, call)).rejects.toThrow();
    expect(call).not.toHaveBeenCalled();
  });
  it("does not fall back to a request when the session read rejects", async () => {
    const call = vi.fn();
    await expect(
      skillAccountRequest(
        uid,
        async () => {
          throw new Error("synthetic unavailable");
        },
        call,
      ),
    ).rejects.toThrow("synthetic unavailable");
    expect(call).not.toHaveBeenCalled();
  });
  it("rechecks the current identity on each read/write, not only on mount", async () => {
    let id = uid;
    const call = vi.fn(async () => "value"),
      read = async () => ({ data: { session: { user: { id } } }, error: null });
    await skillAccountRequest(uid, read, call);
    id = otherUser;
    await expect(skillAccountRequest(uid, read, call)).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("waits for session confirmation before invoking the operation", async () => {
    let resolve!: (value: { data: { session: { user: { id: string } } }; error: null }) => void;
    const session = new Promise<Parameters<typeof resolve>[0]>((done) => {
      resolve = done;
    });
    const call = vi.fn(async () => 1);
    const pending = skillAccountRequest(uid, () => session, call);
    expect(call).not.toHaveBeenCalled();
    resolve({ data: { session: { user: { id: uid } } }, error: null });
    expect(await pending).toBe(1);
    expect(call).toHaveBeenCalledTimes(1);
  });
  it("never retries a rejected operation", async () => {
    const call = vi.fn(async () => {
      throw new Error("synthetic RPC outcome unknown");
    });
    await expect(
      skillAccountRequest(
        uid,
        async () => ({ data: { session: { user: { id: uid } } }, error: null }),
        call,
      ),
    ).rejects.toThrow("synthetic RPC outcome unknown");
    expect(call).toHaveBeenCalledTimes(1);
  });
});
