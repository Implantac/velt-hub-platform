import { coachFeedbackAfterRead, type CoachFeedback } from "./presentation";

export type CoachOperationState = {
  pending: "generate" | "status" | null;
  feedback: CoachFeedback | null;
  review: { refreshed: boolean } | null;
};
const idle: CoachOperationState = { pending: null, feedback: null, review: null };
/** Same-runtime guard survives page remounts; not distributed idempotency or reload persistence. */
export class CoachOperationStore {
  private states = new Map<string, CoachOperationState>();
  private listeners = new Map<string, Set<() => void>>();
  snapshot = (scope: string): CoachOperationState => this.states.get(scope) ?? idle;
  serverSnapshot = (): CoachOperationState => idle;
  subscribe(scope: string, callback: () => void) {
    const callbacks = this.listeners.get(scope) ?? new Set<() => void>();
    callbacks.add(callback);
    this.listeners.set(scope, callbacks);
    return () => {
      callbacks.delete(callback);
      if (callbacks.size === 0) this.listeners.delete(scope);
    };
  }
  private set(scope: string, state: CoachOperationState) {
    this.states.set(scope, state);
    this.listeners.get(scope)?.forEach((callback) => callback());
  }
  begin(scope: string, pending: "generate" | "status") {
    const current = this.snapshot(scope);
    if (current.pending || current.review) return false;
    this.set(scope, { pending, review: null, feedback: null });
    return true;
  }
  finish(scope: string, feedback: CoachFeedback) {
    this.set(scope, {
      pending: null,
      feedback,
      review: feedback.kind === "unconfirmed" ? { refreshed: false } : null,
    });
  }
  afterRead(scope: string, confirmed: boolean) {
    const current = this.snapshot(scope);
    if (current.pending) return;
    this.set(scope, {
      ...current,
      feedback: coachFeedbackAfterRead(current.feedback, confirmed),
      review: current.review ? { refreshed: confirmed } : null,
    });
  }
  afterJourneyRead(scope: string, confirmed: boolean) {
    const current = this.snapshot(scope);
    if (current.pending || current.feedback?.kind !== "generated") return;
    this.set(scope, {
      ...current,
      feedback: { ...current.feedback, journeyReadFailed: !confirmed },
    });
  }
  browseChanged(scope: string) {
    const current = this.snapshot(scope);
    if (current.pending) return;
    this.set(scope, { ...current, review: current.review ? { refreshed: false } : null });
  }
  resume(scope: string, acknowledged: boolean, readReady: boolean) {
    const current = this.snapshot(scope);
    if (current.pending || !current.review?.refreshed || !acknowledged || !readReady) return false;
    this.set(scope, idle);
    return true;
  }
}
export const coachOperations = new CoachOperationStore();
