import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SchedulerJob } from "@/lib/api/_types";
import { PLATFORM_RULES, isPlatformId } from "@/lib/growth/platform-rules";
import { browserTimeZone, formatZonedInstant } from "@/lib/time-zones";
import { SchedulerJobStatus } from "./SchedulerJobStatus";
import { jobDistance } from "../queue-presentation";
import { SchedulerJobActions, type SchedulerActions } from "./SchedulerJobActions";

type Props = SchedulerActions & { jobs: SchedulerJob[] };
/** Native cards on narrow screens, native table on desktop, shared statuses/actions. */
export function SchedulerTable({ jobs, ...actions }: Props) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(Date.now);
  const [timeZone] = useState(browserTimeZone);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const title = (job: SchedulerJob) => job.content?.title || t("scheduler.untitled");
  const channel = (job: SchedulerJob) => {
    const platform = job.channel?.platform;
    return `${platform && isPlatformId(platform) ? PLATFORM_RULES[platform].label : platform || "—"}${job.channel?.handle ? ` · ${job.channel.handle}` : ""}`;
  };
  const when = (job: SchedulerJob) => (
    <>
      <time
        dateTime={Number.isFinite(Date.parse(job.scheduled_at)) ? job.scheduled_at : undefined}
        className="block leading-relaxed [overflow-wrap:anywhere]"
      >
        {formatZonedInstant(job.scheduled_at, i18n.language, timeZone)}
      </time>
      <span className="mt-1 block text-xs text-muted-foreground">
        {jobDistance(job.scheduled_at, now, i18n.language)}
      </span>
    </>
  );
  return (
    <section aria-label={t("scheduler.queueLabel")} className="min-w-0 space-y-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("scheduler.queueTimezone", { timeZone })}
      </p>
      <ul className="min-w-0 space-y-3 md:hidden">
        {jobs.map((job) => (
          <li key={job.id} className="min-w-0">
            <article
              aria-labelledby={`queue-mobile-${job.id}`}
              className="section-card min-w-0 space-y-4 p-4"
            >
              <h3
                id={`queue-mobile-${job.id}`}
                className="text-base font-semibold leading-relaxed [overflow-wrap:anywhere]"
              >
                {title(job)}
              </h3>
              <p className="text-xs text-muted-foreground">{job.content?.type ?? "—"}</p>
              <dl className="min-w-0 space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    {t("scheduler.channel")}
                  </dt>
                  <dd className="mt-1 [overflow-wrap:anywhere]">{channel(job)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    {t("scheduler.scheduledAt")}
                  </dt>
                  <dd className="mt-1">{when(job)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    {t("scheduler.status")}
                  </dt>
                  <dd className="mt-2">
                    <SchedulerJobStatus job={job} now={now} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    {t("scheduler.attempts")}
                  </dt>
                  <dd className="mt-1 tabular-nums">{job.attempts ?? 0}</dd>
                </div>
              </dl>
              <SchedulerJobActions job={job} now={now} {...actions} />
            </article>
          </li>
        ))}
      </ul>
      <div
        role="group"
        aria-label={t("scheduler.queueLabel")}
        tabIndex={0}
        className="section-card hidden overflow-x-auto p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:block"
      >
        <table className="w-full min-w-[750px] text-sm">
          <caption className="sr-only">{t("scheduler.queueLabel")}</caption>
          <thead className="border-b border-border bg-background/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {["content", "channel", "scheduledAt", "status", "attempts", "actions"].map((key) => (
                <th key={key} scope="col" className="px-4 py-3 font-medium">
                  {t(`scheduler.${key}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {jobs.map((job) => (
              <tr key={job.id} className="transition-colors hover:bg-background/40">
                <th
                  scope="row"
                  className="max-w-64 px-4 py-3 text-left font-medium [overflow-wrap:anywhere]"
                >
                  <div>{title(job)}</div>
                  <div className="mt-1 text-xs font-normal text-muted-foreground">
                    {job.content?.type ?? "—"}
                  </div>
                </th>
                <td className="max-w-52 px-4 py-3 text-muted-foreground [overflow-wrap:anywhere]">
                  {channel(job)}
                </td>
                <td className="min-w-52 px-4 py-3">{when(job)}</td>
                <td className="min-w-56 max-w-sm px-4 py-3">
                  <SchedulerJobStatus job={job} now={now} />
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {job.attempts ?? 0}
                </td>
                <td className="px-4 py-3">
                  <SchedulerJobActions job={job} now={now} {...actions} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
