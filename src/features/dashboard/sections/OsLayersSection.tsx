import { Brain, Compass, Rocket, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LinkAction, Panel } from "../components/atoms";
import { PanelFeedback } from "../components/PanelFeedback";
import { dashboardDate, dashboardLoadState } from "../presentation";
import type {
  DashboardBlueprint,
  DashboardCompetitors,
  DashboardJourney,
  DashboardSkills,
  PanelQuery,
} from "../types";

type Props = {
  blueprint: PanelQuery<DashboardBlueprint>;
  competitors: PanelQuery<DashboardCompetitors>;
  skills: PanelQuery<DashboardSkills>;
  journey: PanelQuery<DashboardJourney>;
};

export function OsLayersSection({ blueprint, competitors, skills, journey }: Props) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language);
  const bp = blueprint.data;
  const skill = skills.data;
  const memory = journey.data;
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Panel
        title={t("dashboard.layers.blueprint")}
        icon={Rocket}
        action={<LinkAction to="/app/builder" label={t("dashboard.open")} />}
      >
        <PanelFeedback
          state={dashboardLoadState(blueprint)}
          label={t("dashboard.layers.blueprint")}
          onRetry={() => void blueprint.refetch()}
        >
          {bp && (
            <>
              <p className="text-3xl font-bold tabular-nums">
                {number.format(bp.filled)}/{number.format(bp.total)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t(bp.exists ? "dashboard.layers.filledBlocks" : "dashboard.layers.noBlueprint")}
              </p>
            </>
          )}
        </PanelFeedback>
      </Panel>
      <Panel
        title={t("dashboard.layers.journey")}
        icon={Compass}
        action={<LinkAction to="/app/journey" label={t("dashboard.open")} />}
      >
        <PanelFeedback
          state={dashboardLoadState(journey)}
          label={t("dashboard.layers.journey")}
          onRetry={() => void journey.refetch()}
        >
          {memory && (
            <>
              <p className="text-3xl font-bold tabular-nums">{number.format(memory.events)}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("dashboard.layers.memoryCounts", { decisions: number.format(memory.decisions) })}
              </p>
              {memory.latestEventAt && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("dashboard.layers.lastMemory", {
                    date:
                      dashboardDate(memory.latestEventAt, i18n.language) ??
                      t("dashboard.dateUnavailable"),
                  })}
                </p>
              )}
            </>
          )}
        </PanelFeedback>
      </Panel>
      <Panel
        title={t("dashboard.layers.competitors")}
        icon={Shield}
        action={<LinkAction to="/app/competitors" label={t("dashboard.open")} />}
      >
        <PanelFeedback
          state={dashboardLoadState(competitors)}
          label={t("dashboard.layers.competitors")}
          onRetry={() => void competitors.refetch()}
        >
          {competitors.data && (
            <>
              <p className="text-3xl font-bold tabular-nums">
                {number.format(competitors.data.total)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("dashboard.layers.competitorCounts", {
                  high: number.format(competitors.data.high),
                })}
              </p>
            </>
          )}
        </PanelFeedback>
      </Panel>
      <Panel
        title={t("dashboard.layers.skills")}
        icon={Brain}
        action={<LinkAction to="/app/skill-map" label={t("dashboard.open")} />}
      >
        <PanelFeedback
          state={dashboardLoadState(skills)}
          label={t("dashboard.layers.skills")}
          onRetry={() => void skills.refetch()}
        >
          {skill && (
            <>
              <p className="text-3xl font-bold tabular-nums">{number.format(skill.total)}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("dashboard.layers.assessments")}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {skill.latest === null
                  ? t("dashboard.layers.noSkills")
                  : t("dashboard.layers.latestSkill", { score: number.format(skill.latest.score) })}
              </p>
            </>
          )}
        </PanelFeedback>
      </Panel>
    </section>
  );
}
