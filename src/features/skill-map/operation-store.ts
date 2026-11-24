export type SkillFeedback = {
  kind: "saved" | "unchanged" | "unconfirmed";
  reference: string;
  readFailed: boolean;
};
export type SkillOperation = {
  pending: boolean;
  reading: boolean;
  reference: string | null;
  feedback: SkillFeedback | null;
  review: { refreshed: boolean } | null;
};
const idle: SkillOperation = {
  pending: false,
  reading: false,
  reference: null,
  feedback: null,
  review: null,
};
/** Flags/reference only, by account/workspace scope; no notes, area, score, evidence or private SSR state. */
export class SkillOperationStore {
  private states = new Map<string, SkillOperation>();
  private listeners = new Map<string, Set<() => void>>();
  snapshot = (scope: string) => this.states.get(scope) ?? idle;
  serverSnapshot = () => idle;
  subscribe(scope: string, listener: () => void) {
    const set = this.listeners.get(scope) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(scope, set);
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(scope);
    };
  }
  private set(scope: string, state: SkillOperation) {
    this.states.set(scope, state);
    this.listeners.get(scope)?.forEach((listener) => listener());
  }
  begin(scope: string, reference: string) {
    const current = this.snapshot(scope);
    if (current.pending || current.reading || current.review) return false;
    this.set(scope, { ...idle, pending: true, reference });
    return true;
  }
  finish(scope: string, reference: string, feedback: SkillFeedback) {
    const current = this.snapshot(scope);
    if (!current.pending || current.reference !== reference || feedback.reference !== reference)
      return false;
    this.set(scope, {
      ...idle,
      reference,
      feedback,
      review: feedback.kind === "unconfirmed" ? { refreshed: false } : null,
    });
    return true;
  }
  startRead(scope: string) {
    const current = this.snapshot(scope);
    if (current.pending || current.reading) return false;
    this.set(scope, {
      ...current,
      reading: true,
      review: current.review ? { refreshed: false } : null,
    });
    return true;
  }
  endRead(scope: string, confirmed: boolean) {
    const current = this.snapshot(scope);
    if (!current.reading || current.pending) return;
    this.set(scope, {
      ...current,
      reading: false,
      feedback:
        current.feedback && current.feedback.kind !== "unconfirmed"
          ? { ...current.feedback, readFailed: !confirmed }
          : current.feedback,
      review: current.review ? { refreshed: confirmed } : null,
    });
  }
  resume(scope: string, acknowledged: boolean, readReady: boolean) {
    const current = this.snapshot(scope);
    if (
      current.pending ||
      current.reading ||
      !current.review?.refreshed ||
      !acknowledged ||
      !readReady
    )
      return false;
    this.set(scope, idle);
    return true;
  }
}
export const skillOperations = new SkillOperationStore();
