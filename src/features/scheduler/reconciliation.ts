import type { SchedulerJob } from "@/lib/api/_types";

type ReviewJob = Pick<
  SchedulerJob,
  | "status"
  | "reconcile_state"
  | "provider_reference"
  | "reconcile_after"
  | "reconcile_locked_until"
  | "locked_until"
  | "run_at"
  | "created_at"
>;
const validDate = (value: string | null) => (value ? Date.parse(value) : NaN);
const leaseFree = (value: string | null, now: number) =>
  value === null || (Number.isFinite(validDate(value)) && validDate(value) <= now);

/** UI hints only; the API and fenced SQL enforce these conditions independently. */
export function publicationReviewControls(job: ReviewJob, now = Date.now()) {
  const expired =
    job.status === "processing" &&
    (job.locked_until
      ? Number.isFinite(validDate(job.locked_until)) && validDate(job.locked_until) + 30_000 < now
      : validDate(job.run_at ?? job.created_at) + 600_000 < now);
  const review = job.reconcile_state === "review" && job.status === "dead_letter";
  const pending = job.reconcile_state === "pending" && job.status === "dead_letter";
  const due =
    Number.isFinite(validDate(job.reconcile_after)) && validDate(job.reconcile_after) <= now;
  const unlocked = leaseFree(job.reconcile_locked_until, now) && leaseFree(job.locked_until, now);
  return {
    canCheck: expired || ((pending || review) && !!job.provider_reference && due && unlocked),
    canClose: review && unlocked,
    canCancel: job.status === "pending" && job.reconcile_state === "none",
    expired,
    pending,
    review,
  };
}
