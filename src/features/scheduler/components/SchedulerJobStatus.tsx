import { useTranslation } from "react-i18next";
import { Clock } from "lucide-react";
import type { SchedulerJob } from "@/lib/api/_types";
import { STATUS_META, type JobStatus } from "../constants";
import { publicationReviewControls } from "../reconciliation";
import { jobDistance } from "../queue-presentation";

/** Shared by mobile cards and desktop rows: the same conservative result/receipt explanation. */
export function SchedulerJobStatus({ job, now }: { job: SchedulerJob; now: number }) {
  const { t, i18n } = useTranslation();
  const controls = publicationReviewControls(job, now);
  const meta = STATUS_META[job.status as JobStatus];
  const Icon = meta?.icon ?? Clock;
  const legacy = !job.provider_reference && !!job.external_post_id && job.status !== "succeeded";
  const label = ["pending", "review", "rejected", "closed"].includes(job.reconcile_state)
    ? t(`scheduler.confirmation_${job.reconcile_state}`)
    : t(`scheduler.${job.status}`, { defaultValue: job.status });
  const distance = (at: string | null) => jobDistance(at, now, i18n.language);
  return (
    <div className="min-w-0 space-y-2 [overflow-wrap:anywhere]">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${meta?.className ?? ""}`}
      >
        <Icon
          aria-hidden="true"
          className={`size-3 shrink-0 ${job.status === "processing" ? "animate-spin" : ""}`}
        />
        {label}
      </span>
      {controls.expired && (
        <p className="max-w-sm text-xs text-foreground">{t("scheduler.outcomeUnknown")}</p>
      )}
      {job.reconcile_state === "pending" && (
        <p className="max-w-sm text-xs text-muted-foreground">
          {t("scheduler.reconcilePendingHelp")}
        </p>
      )}
      {job.reconcile_state === "closed" && (
        <p className="max-w-sm text-xs text-muted-foreground">{t("scheduler.closedReviewHelp")}</p>
      )}
      {(job.reconcile_state !== "none" || job.provider_reference || legacy) && (
        <details className="max-w-sm text-xs">
          <summary className="min-h-11 cursor-pointer rounded-sm py-3 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {t("scheduler.checkDetails")}
          </summary>
          {legacy && <p className="mt-2">{t("scheduler.legacyReferenceHelp")}</p>}
          <dl className="mt-2 space-y-2 text-muted-foreground">
            <div>
              <dt className="font-medium">{t("scheduler.providerReference")}</dt>
              <dd className="break-all font-mono">
                {job.provider_reference ??
                  (job.status !== "succeeded" ? job.external_post_id : null) ??
                  "—"}
              </dd>
            </div>
            <div>
              <dt className="font-medium">{t("scheduler.confirmationChecks")}</dt>
              <dd>{job.reconcile_attempts}</dd>
            </div>
            <div>
              <dt className="font-medium">{t("scheduler.lastChecked")}</dt>
              <dd>{distance(job.reconciled_at)}</dd>
            </div>
            {job.reconcile_after && (
              <div>
                <dt className="font-medium">{t("scheduler.nextCheck")}</dt>
                <dd>{distance(job.reconcile_after)}</dd>
              </div>
            )}
            {job.reconcile_note && (
              <div>
                <dt className="sr-only">{t("scheduler.checkNote")}</dt>
                <dd>{job.reconcile_note}</dd>
              </div>
            )}
          </dl>
        </details>
      )}
      {job.last_error && <p className="max-w-sm text-xs text-destructive">{job.last_error}</p>}
    </div>
  );
}
