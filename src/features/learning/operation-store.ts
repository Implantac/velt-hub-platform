export type LearningFeedback = {
  kind: "saved" | "unchanged" | "unconfirmed";
  reference: string;
  readFailed: boolean;
};
export type LearningOperation = {
  pending: boolean;
  reading: boolean;
  reference: string | null;
  feedback: LearningFeedback | null;
  review: { refreshed: boolean } | null;
};
const idle: LearningOperation = {
  pending: false,
  reading: false,
  reference: null,
  feedback: null,
  review: null,
};
/** Flags/reference only, by account; no catalog, milestone IDs, progress payload or private SSR state. */
export class LearningOperationStore {
  private states = new Map<string, LearningOperation>();
  private listeners = new Map<string, Set<() => void>>();
  snapshot = (userId: string) => this.states.get(userId) ?? idle;
  serverSnapshot = () => idle;
  subscribe(userId: string, listener: () => void) {
    const set = this.listeners.get(userId) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(userId, set);
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(userId);
    };
  }
  private set(userId: string, state: LearningOperation) {
    this.states.set(userId, state);
    this.listeners.get(userId)?.forEach((listener) => listener());
  }
  begin(userId: string, reference: string) {
    const current = this.snapshot(userId);
    if (current.pending || current.reading || current.review) return false;
    this.set(userId, { ...idle, pending: true, reference });
    return true;
  }
  finish(userId: string, reference: string, feedback: LearningFeedback) {
    const current = this.snapshot(userId);
    if (!current.pending || current.reference !== reference || feedback.reference !== reference)
      return false;
    this.set(userId, {
      ...idle,
      reference,
      feedback,
      review: feedback.kind === "unconfirmed" ? { refreshed: false } : null,
    });
    return true;
  }
  startRead(userId: string) {
    const current = this.snapshot(userId);
    if (current.pending || current.reading) return false;
    this.set(userId, {
      ...current,
      reading: true,
      review: current.review ? { refreshed: false } : null,
    });
    return true;
  }
  endRead(userId: string, confirmed: boolean) {
    const current = this.snapshot(userId);
    if (!current.reading || current.pending) return;
    this.set(userId, {
      ...current,
      reading: false,
      feedback:
        current.feedback && current.feedback.kind !== "unconfirmed"
          ? { ...current.feedback, readFailed: !confirmed }
          : current.feedback,
      review: current.review ? { refreshed: confirmed } : null,
    });
  }
  resume(userId: string, acknowledged: boolean, readReady: boolean) {
    const current = this.snapshot(userId);
    if (
      current.pending ||
      current.reading ||
      !current.review?.refreshed ||
      !acknowledged ||
      !readReady
    )
      return false;
    this.set(userId, idle);
    return true;
  }
}
export const learningOperations = new LearningOperationStore();
