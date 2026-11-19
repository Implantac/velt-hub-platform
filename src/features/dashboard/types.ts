import type { UseQueryResult } from "@tanstack/react-query";
import type { getDashboard } from "@/lib/api/dashboard.functions";
import type {
  getDashboardAnalysis,
  getDashboardRecommendations,
  getDashboardOpportunities,
  getDashboardBlueprint,
  getDashboardCompetitors,
  getDashboardSkills,
  getDashboardJourney,
} from "@/lib/api/dashboard-panels.functions";
import type { getLatestHealth } from "@/lib/api/health.functions";

export type DashboardOverview = Awaited<ReturnType<typeof getDashboard>>;
export type DashboardAnalysis = Awaited<ReturnType<typeof getDashboardAnalysis>>;
export type DashboardRecommendation = Awaited<
  ReturnType<typeof getDashboardRecommendations>
>[number];
export type DashboardOpportunity = Awaited<ReturnType<typeof getDashboardOpportunities>>[number];
export type DashboardBlueprint = Awaited<ReturnType<typeof getDashboardBlueprint>>;
export type DashboardCompetitors = Awaited<ReturnType<typeof getDashboardCompetitors>>;
export type DashboardSkills = Awaited<ReturnType<typeof getDashboardSkills>>;
export type DashboardJourney = Awaited<ReturnType<typeof getDashboardJourney>>;
export type DashboardHealth = Awaited<ReturnType<typeof getLatestHealth>>;
export type PanelQuery<T> = Pick<UseQueryResult<T>, "data" | "isError" | "refetch">;
