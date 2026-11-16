import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, Clock, Search, ClipboardCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";
import { enUS } from "date-fns/locale/en-US";
import type { SchedulerJob } from "@/lib/api/_types";
import { STATUS_META, type JobStatus } from "../constants";
import { publicationReviewControls } from "../reconciliation";

type Props = {
  jobs: SchedulerJob[];
  onCancel: (jobId: string) => void;
  cancelPending: boolean;
  canManage: boolean;
  onCheck: (jobId: string) => void;
  checkPending: boolean;
  onReview: (job: SchedulerJob) => void;
};

export function SchedulerTable({
  jobs,
  onCancel,
  cancelPending,
  canManage,
  onCheck,
  checkPending,
  onReview,
}: Props) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const distance = (value: string | null) =>
    value && Number.isFinite(Date.parse(value))
      ? formatDistanceToNow(new Date(value), {
          addSuffix: true,
          locale: i18n.language === "en-US" ? enUS : ptBR,
        })
      : "—";
  return (
    <div
      role="region"
      aria-label={t("scheduler.title")}
      tabIndex={0}
      className="section-card overflow-x-auto p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <table className="w-full min-w-[750px] text-sm">
        <thead className="border-b border-border bg-background/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">{t("scheduler.content")}</th>
            <th className="px-4 py-3 font-medium">{t("scheduler.channel")}</th>
            <th className="px-4 py-3 font-medium">{t("scheduler.scheduledAt")}</th>
            <th className="px-4 py-3 font-medium">{t("scheduler.status")}</th>
            <th className="px-4 py-3 font-medium">{t("scheduler.attempts")}</th>
            <th className="px-4 py-3 text-right font-medium">{t("scheduler.actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {jobs.map((job) => {
            const controls = publicationReviewControls(job, now);
            const meta = STATUS_META[job.status as JobStatus];
            const Icon = meta?.icon ?? Clock;
            const hasReconciliation = job.reconcile_state !== "none";
            const hasLegacyReference =
              !job.provider_reference && !!job.external_post_id && job.status !== "succeeded";
            const label = ["pending", "review", "rejected", "closed"].includes(job.reconcile_state)
              ? t(`scheduler.confirmation_${job.reconcile_state}`)
              : t(`scheduler.${job.status}`, { defaultValue: job.status });
            return (
              <tr key={job.id} className="transition-colors hover:bg-background/40">
                <td className="px-4 py-3">
                  <div className="font-medium">{job.content?.title || t("scheduler.untitled")}</div>
                  <div className="text-xs text-muted-foreground">{job.content?.type ?? "—"}</div>
                </td>
                <td className="px-4 py-3 capitalize text-muted-foreground">
                  {job.channel?.platform ?? "—"}
                  {job.channel?.handle ? (
                    <span className="ml-1 text-xs">· {job.channel.handle}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{distance(job.scheduled_at)}</td>
                <td className="min-w-56 px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${meta?.className ?? ""}`}
                  >
                    <Icon
                      aria-hidden="true"
                      className={`size-3 ${job.status === "processing" ? "animate-spin" : ""}`}
                    />
                    {label}
                  </span>
                  {controls.expired && (
                    <p className="mt-1 max-w-xs text-xs text-foreground">
                      {t("scheduler.outcomeUnknown")}
                    </p>
                  )}
                  {job.reconcile_state === "pending" && (
                    <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                      {t("scheduler.reconcilePendingHelp")}
                    </p>
                  )}
                  {job.reconcile_state === "closed" && (
                    <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                      {t("scheduler.closedReviewHelp")}
                    </p>
                  )}
                  {(hasReconciliation || job.provider_reference || hasLegacyReference) && (
                    <details className="mt-2 max-w-xs text-xs">
                      <summary className="cursor-pointer rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        {t("scheduler.checkDetails")}
                      </summary>
                      {!job.provider_reference &&
                        job.external_post_id &&
                        job.status !== "succeeded" && (
                          <p className="mt-2">{t("scheduler.legacyReferenceHelp")}</p>
                        )}
                      <dl className="mt-2 space-y-1 break-words text-muted-foreground">
                        <div>
                          <dt className="inline font-medium">
                            {t("scheduler.providerReference")}:{" "}
                          </dt>
                          <dd className="inline break-all font-mono">
                            {job.provider_reference ??
                              (job.status !== "succeeded" ? job.external_post_id : null) ??
                              "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline font-medium">
                            {t("scheduler.confirmationChecks")}:{" "}
                          </dt>
                          <dd className="inline">{job.reconcile_attempts}</dd>
                        </div>
                        <div>
                          <dt className="inline font-medium">{t("scheduler.lastChecked")}: </dt>
                          <dd className="inline">{distance(job.reconciled_at)}</dd>
                        </div>
                        {job.reconcile_after && (
                          <div>
                            <dt className="inline font-medium">{t("scheduler.nextCheck")}: </dt>
                            <dd className="inline">{distance(job.reconcile_after)}</dd>
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
                  {job.last_error && (
                    <p className="mt-1 max-w-xs break-words text-xs text-destructive">
                      {job.last_error}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {job.attempts ?? 0}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-col items-end gap-2">
                    {controls.canCancel && (
                      <button
                        onClick={() => onCancel(job.id)}
                        disabled={cancelPending}
                        className="inline-flex min-h-11 items-center gap-1 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:border-destructive hover:text-destructive disabled:opacity-50"
                      >
                        <Ban aria-hidden="true" className="size-3" /> {t("scheduler.cancel")}
                      </button>
                    )}
                    {(controls.expired ||
                      controls.pending ||
                      (controls.review && !!job.provider_reference)) && (
                      <button
                        onClick={() => onCheck(job.id)}
                        disabled={!canManage || !controls.canCheck || checkPending}
                        className="inline-flex min-h-11 items-center gap-1 rounded-md border border-border px-3 py-2 text-xs text-foreground hover:border-primary disabled:opacity-50"
                      >
                        <Search aria-hidden="true" className="size-3" />{" "}
                        {t("scheduler.checkPublication")}
                      </button>
                    )}
                    {controls.review && (
                      <button
                        onClick={() => onReview(job)}
                        disabled={!canManage || !controls.canClose || checkPending}
                        className="inline-flex min-h-11 items-center gap-1 rounded-md border border-border px-3 py-2 text-xs text-foreground hover:border-primary disabled:opacity-50"
                      >
                        <ClipboardCheck aria-hidden="true" className="size-3" />{" "}
                        {t("scheduler.closeReview")}
                      </button>
                    )}
                    {!controls.canCancel &&
                      !controls.expired &&
                      !controls.pending &&
                      !controls.review && <span className="text-xs text-muted-foreground">—</span>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
