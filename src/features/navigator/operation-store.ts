import type { NavigatorFeedback } from "./presentation";
export type NavigatorOperation = {
  pending: boolean;
  feedback: NavigatorFeedback | null;
  review: { refreshed: boolean } | null;
};
const idle: NavigatorOperation = { pending: false, feedback: null, review: null };
/** Per-person same-runtime guard. No answers/budget/record payloads or SSR private state are retained here. */
export class NavigatorOperationStore {
  private states = new Map<string, NavigatorOperation>();
  private listeners = new Map<string, Set<() => void>>();
  snapshot = (userId: string) => this.states.get(userId) ?? idle;
  serverSnapshot = () => idle;
  subscribe(userId: string, listener: () => void) {
    const listeners = this.listeners.get(userId) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(userId, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(userId);
    };
  }
  private set(userId: string, state: NavigatorOperation) {
    this.states.set(userId, state);
    this.listeners.get(userId)?.forEach((listener) => listener());
  }
  begin(userId: string) {
    const current = this.snapshot(userId);
    if (current.pending || current.review) return false;
    this.set(userId, { pending: true, feedback: null, review: null });
    return true;
  }
  finish(userId: string, feedback: NavigatorFeedback) {
    this.set(userId, {
      pending: false,
      feedback,
      review: feedback.kind === "unconfirmed" ? { refreshed: false } : null,
    });
  }
  afterRead(userId: string, confirmed: boolean) {
    const current = this.snapshot(userId);
    if (current.pending) return;
    const feedback =
      current.feedback?.kind === "unconfirmed"
        ? current.feedback
        : current.feedback?.kind === "saved"
          ? { ...current.feedback, readFailed: !confirmed }
          : confirmed
            ? { kind: "refreshed" as const }
            : null;
    this.set(userId, {
      ...current,
      feedback,
      review: current.review ? { refreshed: confirmed } : null,
    });
  }
  resume(userId: string, acknowledged: boolean, readReady: boolean) {
    const current = this.snapshot(userId);
    if (current.pending || !current.review?.refreshed || !acknowledged || !readReady) return false;
    this.set(userId, idle);
    return true;
  }
}
export const navigatorOperations = new NavigatorOperationStore();
