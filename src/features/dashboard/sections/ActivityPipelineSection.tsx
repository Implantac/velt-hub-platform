import { FileText, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Empty, Panel } from "../components/atoms";
import type { DashboardOverview } from "../types";
import { dashboardDate } from "../presentation";

export type ActivityEvent = DashboardOverview["events"][number];
type Props = { events: ActivityEvent[]; contentByStatus: Record<string, number> };

export function ActivityPipelineSection({ events, contentByStatus }: Props) {
  const { t, i18n } = useTranslation();
  const total = Object.values(contentByStatus).reduce((sum, value) => sum + value, 0);
  const number = new Intl.NumberFormat(i18n.language);
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <Panel title={t("dashboard.recentActivity")} icon={Zap} className="lg:col-span-2">
        {events.length === 0 ? (
          <Empty text={t("dashboard.panels.noEvents")} />
        ) : (
          <ul className="divide-y divide-border/40">
            {events.slice(0, 8).map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <span className="min-w-0 font-mono text-xs text-accent [overflow-wrap:anywhere]">
                  {event.event_type}
                </span>
                <time dateTime={event.created_at} className="text-xs text-muted-foreground">
                  {dashboardDate(event.created_at, i18n.language) ?? t("dashboard.dateUnavailable")}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={t("dashboard.panels.pipeline")} icon={FileText}>
        {total === 0 ? (
          <Empty text={t("dashboard.panels.noContent")} />
        ) : (
          <div className="space-y-3">
            {Object.entries(contentByStatus).map(([status, value]) => (
              <div key={status}>
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {t(`content.${status}`, { defaultValue: status })}
                  </span>
                  <span className="tabular-nums">{number.format(value)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round((value / total) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </section>
  );
}
