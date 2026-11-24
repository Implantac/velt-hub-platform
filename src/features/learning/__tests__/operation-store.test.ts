import { describe, expect, it, vi } from "vitest";
import { LearningOperationStore, type LearningFeedback } from "../operation-store";
const saved: LearningFeedback = { kind: "saved", reference: "op-a", readFailed: true };
const uncertain: LearningFeedback = { ...saved, kind: "unconfirmed" };
const startUncertain = () => {
  const s = new LearningOperationStore();
  s.begin("a", "op-a");
  s.finish("a", "op-a", uncertain);
  return s;
};
describe("Personal learning runtime guard", () => {
  it("starts with stable nonprivate idle/SSR snapshots", () => {
    const s = new LearningOperationStore();
    expect(s.snapshot("a")).toBe(s.snapshot("missing"));
    s.begin("a", "op-a");
    expect(s.serverSnapshot().pending).toBe(false);
    expect(s.serverSnapshot().reference).toBeNull();
  });
  it("locks synchronously before a second click/remount and isolates accounts", () => {
    const s = new LearningOperationStore();
    expect(s.begin("a", "op-a")).toBe(true);
    expect(s.begin("a", "op-b")).toBe(false);
    expect(s.startRead("a")).toBe(false);
    expect(s.begin("b", "op-b")).toBe(true);
    expect(s.snapshot("a").reference).toBe("op-a");
  });
  it("does not finish another operation or accept a mismatched feedback reference", () => {
    const s = new LearningOperationStore();
    s.begin("a", "op-a");
    expect(s.finish("a", "op-b", saved)).toBe(false);
    expect(s.finish("a", "op-a", { ...saved, reference: "op-b" })).toBe(false);
    expect(s.snapshot("a").pending).toBe(true);
    expect(s.finish("b", "op-a", saved)).toBe(false);
  });
  it("does not accept repeated late finishes after primary success", () => {
    const s = new LearningOperationStore();
    s.begin("a", "op-a");
    expect(s.finish("a", "op-a", saved)).toBe(true);
    expect(s.finish("a", "op-a", uncertain)).toBe(false);
    expect(s.snapshot("a").feedback?.kind).toBe("saved");
  });
  it.each(["saved", "unchanged"] as const)(
    "preserves primary %s while reread warning resolves or returns",
    (kind) => {
      const s = new LearningOperationStore();
      s.begin("a", "op-a");
      s.finish("a", "op-a", { ...saved, kind });
      s.startRead("a");
      s.endRead("a", true);
      expect(s.snapshot("a").feedback).toEqual({ ...saved, kind, readFailed: false });
      s.startRead("a");
      s.endRead("a", false);
      expect(s.snapshot("a").feedback).toEqual({ ...saved, kind });
      expect(s.snapshot("a").review).toBeNull();
    },
  );
  it("blocks repeated reads and writes during a manual read, including remount", () => {
    const s = new LearningOperationStore();
    expect(s.startRead("a")).toBe(true);
    expect(s.startRead("a")).toBe(false);
    expect(s.begin("a", "op-a")).toBe(false);
    s.endRead("a", false);
    expect(s.startRead("a")).toBe(true);
  });
  it("ignores a stale endRead with no current read", () => {
    const s = startUncertain();
    s.endRead("a", true);
    expect(s.snapshot("a").review?.refreshed).toBe(false);
  });
  it("uncertainty retains the reference and requires a deliberate confirmed GET plus human", () => {
    const s = startUncertain();
    expect(s.snapshot("a").reference).toBe("op-a");
    expect(s.begin("a", "op-b")).toBe(false);
    expect(s.resume("a", true, true)).toBe(false);
    s.startRead("a");
    s.endRead("a", false);
    expect(s.resume("a", true, true)).toBe(false);
    s.startRead("a");
    s.endRead("a", true);
    expect(s.resume("a", false, true)).toBe(false);
    expect(s.resume("a", true, false)).toBe(false);
    expect(s.resume("a", true, true)).toBe(true);
    expect(s.snapshot("a").feedback).toBeNull();
    expect(s.begin("a", "op-b")).toBe(true);
  });
  it("a new read revokes earlier review eligibility and cannot resume while reading", () => {
    const s = startUncertain();
    s.startRead("a");
    s.endRead("a", true);
    s.startRead("a");
    expect(s.snapshot("a").review?.refreshed).toBe(false);
    expect(s.resume("a", true, true)).toBe(false);
    s.endRead("a", false);
    expect(s.resume("a", true, true)).toBe(false);
  });
  it("late operations change only the old account, not another logged-in user", () => {
    const s = new LearningOperationStore();
    s.begin("a", "op-a");
    s.begin("b", "op-b");
    s.finish("a", "op-a", uncertain);
    expect(s.snapshot("b").pending).toBe(true);
    expect(s.snapshot("b").reference).toBe("op-b");
    expect(s.snapshot("b").feedback).toBeNull();
  });
  it("notifies only subscribed scopes and removes listeners on unmount", () => {
    const s = new LearningOperationStore(),
      a = vi.fn(),
      b = vi.fn(),
      off = s.subscribe("a", a);
    s.subscribe("b", b);
    s.begin("a", "op-a");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    off();
    s.finish("a", "op-a", saved);
    expect(a).toHaveBeenCalledTimes(1);
  });
  it("retains only flags/reference/feedback, never progress/catalog/intent payloads", () => {
    const s = startUncertain();
    expect(Object.keys(s.snapshot("a")).sort()).toEqual([
      "feedback",
      "pending",
      "reading",
      "reference",
      "review",
    ]);
    expect(JSON.stringify(s.snapshot("a"))).not.toContain("milestone");
  });
});
