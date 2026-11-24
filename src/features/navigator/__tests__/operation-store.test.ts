import { describe, expect, it, vi } from "vitest";
import { NavigatorOperationStore } from "../operation-store";
import { otherUser, revisionId, userId } from "@/lib/navigator/__tests__/fixtures";

const uncertain = { kind: "unconfirmed" as const, reference: revisionId };
const saved = {
  kind: "saved" as const,
  reference: revisionId,
  mode: "created" as const,
  readFailed: false,
};
describe("Navigator personal same-runtime operation guard", () => {
  it("acquires synchronously, rejecting a double click before React rerenders", () => {
    const store = new NavigatorOperationStore();
    expect(store.begin(userId)).toBe(true);
    expect(store.begin(userId)).toBe(false);
    expect(store.snapshot(userId).pending).toBe(true);
  });
  it("scopes operations by account, not workspace, and never reports another account's result", () => {
    const store = new NavigatorOperationStore();
    store.begin(userId);
    expect(store.snapshot(otherUser)).toEqual({ pending: false, feedback: null, review: null });
    expect(store.begin(otherUser)).toBe(true);
    store.finish(userId, uncertain);
    expect(store.snapshot(otherUser).pending).toBe(true);
    expect(store.snapshot(otherUser).feedback).toBeNull();
  });
  it("survives a same-runtime remount/subscription cycle, without promising persistence across reloads", () => {
    const store = new NavigatorOperationStore(),
      unsubscribe = store.subscribe(userId, vi.fn());
    store.begin(userId);
    unsubscribe();
    expect(store.begin(userId)).toBe(false);
    store.finish(userId, uncertain);
    const listener = vi.fn();
    store.subscribe(userId, listener);
    expect(store.snapshot(userId).review?.refreshed).toBe(false);
    expect(store.begin(userId)).toBe(false);
    expect(new NavigatorOperationStore().snapshot(userId).review).toBeNull();
  });
  it("notifies only the account subscribed and removes empty subscriptions", () => {
    const store = new NavigatorOperationStore(),
      a = vi.fn(),
      b = vi.fn(),
      offA = store.subscribe(userId, a),
      offB = store.subscribe(otherUser, b);
    store.begin(userId);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    offA();
    store.finish(userId, saved);
    expect(a).toHaveBeenCalledTimes(1);
    offB();
  });
  it("does not expose process-wide private operation state in an SSR snapshot", () => {
    const store = new NavigatorOperationStore();
    store.begin(userId);
    store.finish(userId, uncertain);
    expect(store.serverSnapshot()).toEqual({ pending: false, feedback: null, review: null });
  });
  it("records a confirmed save separately from the later read, never converting it to an uncertain write", () => {
    const store = new NavigatorOperationStore();
    store.begin(userId);
    store.finish(userId, saved);
    store.afterRead(userId, false);
    expect(store.snapshot(userId)).toEqual({
      pending: false,
      feedback: { ...saved, readFailed: true },
      review: null,
    });
    store.afterRead(userId, true);
    expect(store.snapshot(userId).feedback).toEqual(saved);
  });
  it("does not erase an unconfirmed reference or permit another save after an unavailable reread", () => {
    const store = new NavigatorOperationStore();
    store.begin(userId);
    store.finish(userId, uncertain);
    store.afterRead(userId, false);
    expect(store.snapshot(userId).feedback).toEqual(uncertain);
    expect(store.snapshot(userId).review).toEqual({ refreshed: false });
    expect(store.begin(userId)).toBe(false);
    expect(store.resume(userId, true, true)).toBe(false);
  });
  it.each([
    [false, false],
    [true, false],
    [false, true],
  ])("requires both human acknowledgement and a ready read (%s/%s)", (acknowledged, readReady) => {
    const store = new NavigatorOperationStore();
    store.begin(userId);
    store.finish(userId, uncertain);
    store.afterRead(userId, true);
    expect(store.resume(userId, acknowledged, readReady)).toBe(false);
    expect(store.begin(userId)).toBe(false);
  });
  it("does not accept human confirmation before a successful deliberate reread", () => {
    const store = new NavigatorOperationStore();
    store.begin(userId);
    store.finish(userId, uncertain);
    expect(store.resume(userId, true, true)).toBe(false);
  });
  it("a later failed reread revokes an earlier fresh-review flag", () => {
    const store = new NavigatorOperationStore();
    store.begin(userId);
    store.finish(userId, uncertain);
    store.afterRead(userId, true);
    store.afterRead(userId, false);
    expect(store.resume(userId, true, true)).toBe(false);
    expect(store.snapshot(userId).review?.refreshed).toBe(false);
  });
  it("finishes human review without replaying a save or keeping the old proposal/reference as a new operation", () => {
    const store = new NavigatorOperationStore();
    store.begin(userId);
    store.finish(userId, uncertain);
    store.afterRead(userId, true);
    expect(store.resume(userId, true, true)).toBe(true);
    expect(store.snapshot(userId)).toEqual({ pending: false, feedback: null, review: null });
    expect(store.begin(userId)).toBe(true);
  });
  it("ignores reads and attempts to resume while a save is still pending", () => {
    const store = new NavigatorOperationStore();
    store.begin(userId);
    const before = store.snapshot(userId);
    store.afterRead(userId, true);
    expect(store.snapshot(userId)).toBe(before);
    expect(store.resume(userId, true, true)).toBe(false);
  });
  it("can announce a successful read, but does not invent success feedback for a failed read", () => {
    const store = new NavigatorOperationStore();
    store.afterRead(userId, false);
    expect(store.snapshot(userId).feedback).toBeNull();
    store.afterRead(userId, true);
    expect(store.snapshot(userId).feedback).toEqual({ kind: "refreshed" });
  });
  it("retains only operation flags and a reference, not answers, a personal record or budget", () => {
    const store = new NavigatorOperationStore();
    store.begin(userId);
    store.finish(userId, uncertain);
    expect(Object.keys(store.snapshot(userId)).sort()).toEqual(["feedback", "pending", "review"]);
    expect(Object.keys(store.snapshot(userId).feedback!).sort()).toEqual(["kind", "reference"]);
    expect(JSON.stringify(store.snapshot(userId))).not.toMatch(
      /goals|answers|budget|user_id|preferred_channels/,
    );
  });
});
