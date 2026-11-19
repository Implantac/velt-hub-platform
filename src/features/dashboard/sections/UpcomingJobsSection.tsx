import { Link } from "@tanstack/react-router";
import { Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DashboardOverview } from "../types";
import { dashboardDate } from "../presentation";
import { Empty, LinkAction, Panel } from "../components/atoms";

export function UpcomingJobsSection({
  jobs,
  total,
}: {
  jobs: DashboardOverview["upcomingJobs"];
  total: number;
}) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language);
  return (
    <Panel
      title={t("dashboard.futurePending")}
      icon={Calendar}
      action={<LinkAction to="/app/scheduler" label={t("dashboard.openScheduler")} />}
    >
      <p className="mb-3 text-xs text-muted-foreground">
        {t("dashboard.upcomingPreview", {
          shown: number.format(jobs.length),
          total: number.format(total),
        })}
      </p>
      {total === 0 ? (
        <Empty text={t("dashboard.noFuturePending")} />
      ) : (
        <ol className="space-y-2">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-3 text-sm"
            >
              <Link
                to="/app/scheduler"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {t("dashboard.pendingPublication")}
              </Link>
              <time dateTime={job.scheduled_at} className="tabular-nums text-muted-foreground">
                {dashboardDate(job.scheduled_at, i18n.language) ?? t("dashboard.dateUnavailable")}
              </time>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{t("dashboard.upcomingHint")}</p>
    </Panel>
  );
}
