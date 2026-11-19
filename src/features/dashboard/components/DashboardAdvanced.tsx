import { useTranslation } from "react-i18next";
import { useBrainRealtime } from "@/lib/brain/use-brain-realtime";
import { useDashboardAdvanced } from "../hooks/use-dashboard-advanced";
import type { DashboardOverview } from "../types";
import { dashboardLoadState } from "../presentation";
import { PanelFeedback } from "./PanelFeedback";
import { FiveQuestionsSection } from "../sections/FiveQuestionsSection";
import { TopRowSection } from "../sections/TopRowSection";
import { CoachMissionsSection } from "../sections/CoachMissionsSection";
import { ActivityPipelineSection } from "../sections/ActivityPipelineSection";
import { OsLayersSection } from "../sections/OsLayersSection";

export function DashboardAdvanced({
  workspaceId,
  userId,
  overview,
}: {
  workspaceId: string;
  userId: string;
  overview: DashboardOverview;
}) {
  const { t } = useTranslation();
  useBrainRealtime(workspaceId);
  const queries = useDashboardAdvanced(workspaceId, userId);
  return (
    <div className="space-y-6" data-dashboard-advanced="true">
      <PanelFeedback
        state={dashboardLoadState(queries.analysis)}
        label={t("dashboard.savedAnalysis")}
        onRetry={() => void queries.analysis.refetch()}
      >
        <FiveQuestionsSection answers={queries.analysis.data?.answers ?? []} />
      </PanelFeedback>
      <TopRowSection
        analysis={queries.analysis}
        health={queries.health}
        opportunities={queries.opportunities}
      />
      <CoachMissionsSection
        recommendations={queries.recommendations}
        priorityMissions={overview.missions}
      />
      <ActivityPipelineSection
        events={overview.events}
        contentByStatus={overview.contentByStatus}
      />
      <OsLayersSection
        blueprint={queries.blueprint}
        competitors={queries.competitors}
        skills={queries.skills}
        journey={queries.journey}
      />
    </div>
  );
}
