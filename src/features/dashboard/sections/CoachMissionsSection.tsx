import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Brain, Target } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Empty, LinkAction, Panel, RecIcon, SeverityPill, StatusPill } from "../components/atoms";
import { PanelFeedback } from "../components/PanelFeedback";
import { dashboardActionHref, dashboardLoadState } from "../presentation";
import type { DashboardOverview, DashboardRecommendation, PanelQuery } from "../types";
import { readCta } from "@/lib/json";

export type PriorityMission = DashboardOverview["missions"][number];
type Props = {
  recommendations: PanelQuery<DashboardRecommendation[]>;
  priorityMissions: PriorityMission[];
};

export function CoachMissionsSection({ recommendations, priorityMissions }: Props) {
  const { t } = useTranslation();
  const missions = priorityMissions
    .filter((mission) => mission.status === "pending" || mission.status === "in_progress")
    .slice(0, 4);
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <Panel
        className="lg:col-span-2"
        title={t("dashboard.coachSteps")}
        icon={Brain}
        action={<LinkAction to="/app/coach" label={t("dashboard.openCoach")} />}
      >
        <PanelFeedback
          state={dashboardLoadState(recommendations)}
          label={t("dashboard.coachSteps")}
          onRetry={() => void recommendations.refetch()}
        >
          {(recommendations.data ?? []).length === 0 ? (
            <Empty text={t("dashboard.noSavedRecommendations")} />
          ) : (
            <ul className="space-y-2">
              {recommendations.data?.map((recommendation) => {
                const cta = readCta(recommendation.cta);
                const href = dashboardActionHref(cta?.href);
                return (
                  <li key={recommendation.id} className="rounded-xl border border-border/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <RecIcon kind={recommendation.kind} />
                        <div className="min-w-0">
                          <h3 className="font-semibold [overflow-wrap:anywhere]">
                            {recommendation.title}
                          </h3>
                          {recommendation.body && (
                            <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                              {recommendation.body}
                            </p>
                          )}
                        </div>
                      </div>
                      <SeverityPill severity={recommendation.severity} />
                    </div>
                    {cta && href && (
                      <Link
                        to={href}
                        className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        {cta.label ?? t("dashboard.open")}
                        <ArrowUpRight aria-hidden="true" className="size-3" />
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </PanelFeedback>
      </Panel>
      <Panel
        title={t("dashboard.priorityMissions")}
        icon={Target}
        action={<LinkAction to="/app/missions" label={t("common.viewAll")} />}
      >
        {missions.length === 0 ? (
          <Empty text={t("dashboard.noPendingMissions")} />
        ) : (
          <ul className="space-y-2">
            {missions.map((mission) => (
              <li
                key={mission.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 p-4"
              >
                <span className="min-w-0 text-sm [overflow-wrap:anywhere]">{mission.title}</span>
                <StatusPill status={mission.status} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
}
