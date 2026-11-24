import { describe, expect, it, vi } from "vitest";
import { CoachOperationStore } from "../operation-store";

const scope = JSON.stringify(["workspace-A", "user-A"]),
  other = JSON.stringify(["workspace-B", "user-A"]),
  newUser = JSON.stringify(["workspace-A", "user-B"]);
describe("same-runtime Coach operation guard", () => {
  it("locks synchronously so two same-tick confirmations cannot start two POST tasks", () => {
    const store = new CoachOperationStore();
    expect(store.begin(scope, "generate")).toBe(true);
    expect(store.begin(scope, "generate")).toBe(false);
    expect(store.begin(scope, "status")).toBe(false);
    expect(store.snapshot(scope).pending).toBe("generate");
  });
  it("retains a scoped pending decision across unsubscribe/remount, not across another user/workspace", () => {
    const store = new CoachOperationStore(),
      listener = vi.fn();
    const off = store.subscribe(scope, listener);
    store.begin(scope, "status");
    off();
    const second = vi.fn();
    store.subscribe(scope, second);
    expect(store.snapshot(scope).pending).toBe("status");
    expect(store.begin(scope, "status")).toBe(false);
    expect(store.snapshot(other).pending).toBeNull();
    expect(store.snapshot(newUser).pending).toBeNull();
    store.finish(scope, { kind: "statusSaved" });
    expect(second).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledOnce();
  });
  it("never exposes client ledger state via its SSR snapshot", () => {
    const store = new CoachOperationStore();
    store.begin(scope, "generate");
    expect(store.serverSnapshot()).toEqual({ pending: null, feedback: null, review: null });
    expect(store.serverSnapshot()).toBe(store.serverSnapshot());
  });
  it("only notifies the exact scope; a late response cannot display feedback under another identity", () => {
    const store = new CoachOperationStore(),
      old = vi.fn(),
      next = vi.fn(),
      user = vi.fn();
    store.subscribe(scope, old);
    store.subscribe(other, next);
    store.subscribe(newUser, user);
    store.begin(scope, "generate");
    store.finish(scope, { kind: "generated", generated: 4 });
    expect(old).toHaveBeenCalledTimes(2);
    expect(next).not.toHaveBeenCalled();
    expect(user).not.toHaveBeenCalled();
    expect(store.snapshot(other).feedback).toBeNull();
  });
  it("blocks new decisions after an uncertain response and does not let GET alone claim success", () => {
    const store = new CoachOperationStore();
    store.begin(scope, "generate");
    store.finish(scope, { kind: "unconfirmed", reference: "batch" });
    expect(store.begin(scope, "generate")).toBe(false);
    store.afterRead(scope, true);
    expect(store.snapshot(scope).feedback?.kind).toBe("unconfirmed");
    expect(store.snapshot(scope).review?.refreshed).toBe(true);
    expect(store.resume(scope, false, true)).toBe(false);
    expect(store.resume(scope, true, false)).toBe(false);
    expect(store.resume(scope, true, true)).toBe(true);
    expect(store.snapshot(scope).feedback).toBeNull();
    expect(store.snapshot(scope).pending).toBeNull();
  });
  it("does not accept an acknowledgement before a fresh explicit successful GET", () => {
    const store = new CoachOperationStore();
    store.finish(scope, { kind: "unconfirmed" });
    expect(store.resume(scope, true, true)).toBe(false);
    store.afterRead(scope, false);
    expect(store.resume(scope, true, true)).toBe(false);
    expect(store.snapshot(scope).review?.refreshed).toBe(false);
  });
  it("resets human review when filter/page changes instead of reusing acknowledgement of another page", () => {
    const store = new CoachOperationStore();
    store.finish(scope, { kind: "unconfirmed" });
    store.afterRead(scope, true);
    store.browseChanged(scope);
    expect(store.snapshot(scope).review?.refreshed).toBe(false);
    expect(store.resume(scope, true, true)).toBe(false);
  });
  it("ignores GET or navigation state transitions while a write is pending", () => {
    const store = new CoachOperationStore();
    store.begin(scope, "generate");
    const before = store.snapshot(scope);
    store.afterRead(scope, true);
    store.browseChanged(scope);
    expect(store.snapshot(scope)).toBe(before);
    expect(store.resume(scope, true, true)).toBe(false);
  });
  it("clears only the journey-read warning after that panel is reread successfully", () => {
    const store = new CoachOperationStore();
    store.finish(scope, {
      kind: "generated",
      generated: 4,
      eventMissing: true,
      readFailed: true,
      journeyReadFailed: true,
    });
    store.afterJourneyRead(scope, true);
    expect(store.snapshot(scope).feedback).toEqual({
      kind: "generated",
      generated: 4,
      eventMissing: true,
      readFailed: true,
      journeyReadFailed: false,
    });
    expect(store.snapshot(scope).review).toBeNull();
  });
  it("does not let a journey reread unlock or reinterpret an uncertain write", () => {
    const store = new CoachOperationStore();
    store.finish(scope, { kind: "unconfirmed" });
    store.afterJourneyRead(scope, true);
    expect(store.snapshot(scope).feedback?.kind).toBe("unconfirmed");
    expect(store.snapshot(scope).review?.refreshed).toBe(false);
    expect(store.resume(scope, true, true)).toBe(false);
  });
  it("preserves confirmed batch and secondary warning when a reread fails", () => {
    const store = new CoachOperationStore();
    store.finish(scope, { kind: "generated", generated: 4, eventMissing: true });
    store.afterRead(scope, false);
    expect(store.snapshot(scope).feedback).toEqual({
      kind: "generated",
      generated: 4,
      eventMissing: true,
      readFailed: true,
    });
    expect(store.snapshot(scope).review).toBeNull();
    store.afterRead(scope, true);
    expect(store.snapshot(scope).feedback?.eventMissing).toBe(true);
    expect(store.snapshot(scope).feedback?.readFailed).toBe(false);
  });
});
