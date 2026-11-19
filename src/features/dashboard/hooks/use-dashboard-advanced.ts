import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getDashboardAnalysis,
  getDashboardRecommendations,
  getDashboardOpportunities,
  getDashboardBlueprint,
  getDashboardCompetitors,
  getDashboardSkills,
  getDashboardJourney,
} from "@/lib/api/dashboard-panels.functions";
import { getLatestHealth } from "@/lib/api/health.functions";
import { dashboardQueryKey } from "../presentation";

/** Mounted only when the advanced section is actually shown. */
export function useDashboardAdvanced(workspaceId: string, userId: string) {
  const analysis = useServerFn(getDashboardAnalysis);
  const recommendations = useServerFn(getDashboardRecommendations);
  const health = useServerFn(getLatestHealth);
  const opportunities = useServerFn(getDashboardOpportunities);
  const blueprint = useServerFn(getDashboardBlueprint);
  const competitors = useServerFn(getDashboardCompetitors);
  const skills = useServerFn(getDashboardSkills);
  const journey = useServerFn(getDashboardJourney);
  const scope = { data: { workspaceId } };
  return {
    analysis: useQuery({
      queryKey: dashboardQueryKey("dashboard-analysis", workspaceId, userId),
      queryFn: () => analysis(scope),
      retry: 1,
    }),
    recommendations: useQuery({
      queryKey: dashboardQueryKey("dashboard-recommendations", workspaceId, userId),
      queryFn: () => recommendations(scope),
      retry: 1,
    }),
    health: useQuery({
      queryKey: dashboardQueryKey("dashboard-health", workspaceId, userId),
      queryFn: () => health(scope),
      retry: 1,
    }),
    opportunities: useQuery({
      queryKey: dashboardQueryKey("dashboard-opportunities", workspaceId, userId),
      queryFn: () => opportunities(scope),
      retry: 1,
    }),
    blueprint: useQuery({
      queryKey: dashboardQueryKey("dashboard-blueprint", workspaceId, userId),
      queryFn: () => blueprint(scope),
      retry: 1,
    }),
    competitors: useQuery({
      queryKey: dashboardQueryKey("dashboard-competitors", workspaceId, userId),
      queryFn: () => competitors(scope),
      retry: 1,
    }),
    skills: useQuery({
      queryKey: dashboardQueryKey("dashboard-skills", workspaceId, userId),
      queryFn: () => skills(scope),
      retry: 1,
    }),
    journey: useQuery({
      queryKey: dashboardQueryKey("dashboard-journey", workspaceId, userId),
      queryFn: () => journey(scope),
      retry: 1,
    }),
  };
}
