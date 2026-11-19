import { useTranslation } from "react-i18next";
import { Flame, Gauge, Heart } from "lucide-react";
import { ScoreGauge } from "@/components/app/ScoreGauge";
import { Empty, LinkAction, Panel } from "../components/atoms";
import { PanelFeedback } from "../components/PanelFeedback";
import { dashboardDate, dashboardLoadState } from "../presentation";
import type {
  DashboardAnalysis,
  DashboardHealth,
  DashboardOpportunity,
  PanelQuery,
} from "../types";

type Props = {
  analysis: PanelQuery<DashboardAnalysis>;
  health: PanelQuery<DashboardHealth>;
  opportunities: PanelQuery<DashboardOpportunity[]>;
};

export function TopRowSection({ analysis, health, opportunities }: Props) {
  const { t, i18n } = useTranslation();
  const score = analysis.data?.score;
  const healthRows = health.data ?? [];
  const healthAvg =
    healthRows.length === 0
      ? null
      : Math.round(healthRows.reduce((sum, row) => sum + row.score, 0) / healthRows.length);
  const number = new Intl.NumberFormat(i18n.language);
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <Panel
        title={t("dashboard.digitalScore")}
        icon={Gauge}
        action={<LinkAction to="/app/score" label={t("dashboard.details")} />}
      >
        <PanelFeedback
          state={dashboardLoadState(analysis)}
          label={t("dashboard.digitalScore")}
          onRetry={() => void analysis.refetch()}
        >
          {score == null ? (
            <Empty text={t("dashboard.noSavedScore")} />
          ) : (
            <div className="grid justify-items-center gap-3">
              <ScoreGauge value={score.overall} size={180} label={t("dashboard.digitalScore")} />
              <p className="text-center text-xs text-muted-foreground">
                {t("dashboard.analysisAt", {
                  date:
                    dashboardDate(score.computedAt, i18n.language) ??
                    t("dashboard.dateUnavailable"),
                })}
              </p>
            </div>
          )}
        </PanelFeedback>
      </Panel>
      <Panel
        title={t("dashboard.businessHealth")}
        icon={Heart}
        action={<LinkAction to="/app/health" label={t("dashboard.diagnosis")} />}
      >
        <PanelFeedback
          state={dashboardLoadState(health)}
          label={t("dashboard.businessHealth")}
          onRetry={() => void health.refetch()}
        >
          {healthAvg === null ? (
            <Empty text={t("dashboard.noSavedHealth")} />
          ) : (
            <div>
              <p className="mb-1 text-4xl font-bold tabular-nums">
                {number.format(healthAvg)}
                <span className="ml-2 text-sm font-normal text-muted-foreground">/ 100</span>
              </p>
              <p className="mb-4 text-xs text-muted-foreground">
                {t("dashboard.healthAverage", { count: healthRows.length })}
              </p>
              <ul className="space-y-3">
                {healthRows.map((row) => (
                  <li key={row.id}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span>{t(`dashboard.healthCategories.${row.category}`)}</span>
                      <span className="tabular-nums">{number.format(row.score)}</span>
                    </div>
                    <div className="h-1 rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${row.score}%` }}
                      />
                    </div>
                    <time
                      dateTime={row.computed_at}
                      className="mt-1 block text-[11px] text-muted-foreground"
                    >
                      {dashboardDate(row.computed_at, i18n.language) ??
                        t("dashboard.dateUnavailable")}
                    </time>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </PanelFeedback>
      </Panel>
      <Panel
        title={t("dashboard.trending")}
        icon={Flame}
        action={<LinkAction to="/app/opportunities" label={t("dashboard.explore")} />}
      >
        <PanelFeedback
          state={dashboardLoadState(opportunities)}
          label={t("dashboard.trending")}
          onRetry={() => void opportunities.refetch()}
        >
          {(opportunities.data ?? []).length === 0 ? (
            <Empty text={t("dashboard.noTrending")} />
          ) : (
            <ul className="space-y-2">
              {opportunities.data?.map((opportunity) => (
                <li key={opportunity.id} className="rounded-lg border border-border/70 p-3">
                  {opportunity.workspace_id === null && (
                    <p className="mb-1 text-xs text-warning">{t("opportunitySource.example")}</p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{opportunity.title}</span>
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] text-primary">
                      {t(`dashboard.opportunityStates.${opportunity.status}`)}
                    </span>
                  </div>
                  {opportunity.description && (
                    <p className="mt-2 text-xs text-muted-foreground">{opportunity.description}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </PanelFeedback>
      </Panel>
    </section>
  );
}
