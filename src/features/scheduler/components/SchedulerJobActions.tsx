import { useTranslation } from "react-i18next";
import { Ban, Search, ClipboardCheck } from "lucide-react";
import type { SchedulerJob } from "@/lib/api/_types";
import { publicationReviewControls } from "../reconciliation";

export interface SchedulerActions {
  onCancel: (jobId: string) => void;
  cancelPending: boolean;
  canManage: boolean;
  onCheck: (jobId: string) => void;
  checkPending: boolean;
  onReview: (job: SchedulerJob) => void;
}
/** One action policy for both layouts; does not add retry, rescheduling or a publish shortcut. */
export function SchedulerJobActions({
  job,
  now,
  onCancel,
  cancelPending,
  canManage,
  onCheck,
  checkPending,
  onReview,
}: SchedulerActions & { job: SchedulerJob; now: number }) {
  const { t } = useTranslation();
  const controls = publicationReviewControls(job, now);
  const canShowCheck =
    controls.expired || controls.pending || (controls.review && !!job.provider_reference);
  const classes =
    "inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-foreground hover:border-primary disabled:opacity-50";
  return (
    <div className="flex flex-wrap gap-2 md:flex-col md:items-end">
      {controls.canCancel && (
        <button
          type="button"
          onClick={() => onCancel(job.id)}
          disabled={cancelPending}
          className={classes}
        >
          <Ban aria-hidden="true" className="size-3 shrink-0" />
          {t("scheduler.cancel")}
        </button>
      )}
      {canShowCheck && (
        <button
          type="button"
          onClick={() => onCheck(job.id)}
          disabled={!canManage || !controls.canCheck || checkPending}
          className={classes}
        >
          <Search aria-hidden="true" className="size-3 shrink-0" />
          {t("scheduler.checkPublication")}
        </button>
      )}
      {controls.review && (
        <button
          type="button"
          onClick={() => onReview(job)}
          disabled={!canManage || !controls.canClose || checkPending}
          className={classes}
        >
          <ClipboardCheck aria-hidden="true" className="size-3 shrink-0" />
          {t("scheduler.closeReview")}
        </button>
      )}
      {!controls.canCancel && !canShowCheck && !controls.review && (
        <span className="text-xs text-muted-foreground">{t("scheduler.noActions")}</span>
      )}
    </div>
  );
}
