import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { getDashboard } from "@/lib/api/dashboard.functions";
import { useCurrentWorkspaceId } from "@/lib/workspace/use-workspace";
import { useWorkspaceAccess } from "@/lib/workspace/use-workspace-access";
import { PageTransition } from "@/components/app/Motion";
import { stagger } from "@/components/app/motion-presets";
import { PageSkeleton } from "@/components/app/Skeletons";
import { DashboardHeader } from "./components/DashboardHeader";
import { DashboardAdvanced } from "./components/DashboardAdvanced";
import { PanelFeedback } from "./components/PanelFeedback";
import { GettingStartedSection } from "./sections/GettingStartedSection";
import { KpiFooterSection } from "./sections/KpiFooterSection";
import { UpcomingJobsSection } from "./sections/UpcomingJobsSection";
import { useDashboardReadRefresh } from "./hooks/use-dashboard-read-refresh";
import {
  canReadDashboard,
  dashboardDate,
  dashboardLoadState,
  dashboardQueryKey,
  needsDashboardSetup,
  shouldLoadDashboardAdvanced,
} from "./presentation";

export function DashboardPage() {
  const { t } = useTranslation();
  const [workspaceId] = useCurrentWorkspaceId();
  const access = useWorkspaceAccess();
  const userId = access.userId;
  if (access.authLoading || (userId && workspaceId && access.isPending))
    return (
      <div role="status" aria-label={t("access.checking")}>
        <PageSkeleton stats={4} rows={4} />
      </div>
    );
  if (!userId || !workspaceId)
    return (
      <p role="status" className="p-8 text-muted-foreground">
        {t("common.noWorkspace")}
      </p>
    );
  if (access.isError || !canReadDashboard(access.role))
    return (
      <section role="alert" className="space-y-3 rounded-xl border border-border p-6">
        <h1 className="text-xl font-semibold">{t("dashboard.accessUnavailable")}</h1>
        <p className="text-sm text-muted-foreground">{t("dashboard.accessHint")}</p>
        <button
          type="button"
          onClick={access.retry}
          disabled={access.isFetching}
          className="min-h-11 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {t("common.tryAgain")}
        </button>
      </section>
    );
  return (
    <DashboardWorkspace
      key={`${userId}:${workspaceId}`}
      workspaceId={workspaceId}
      userId={userId}
      canEdit={access.canEdit}
      canManage={access.canManage}
    />
  );
}

function DashboardWorkspace({
  workspaceId,
  userId,
  canEdit,
  canManage,
}: {
  workspaceId: string;
  userId: string;
  canEdit: boolean;
  canManage: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const fetchOverview = useServerFn(getDashboard);
  const overview = useQuery({
    queryKey: dashboardQueryKey("dashboard", workspaceId, userId),
    queryFn: () => fetchOverview({ data: { workspaceId } }),
    refetchInterval: 30_000,
    retry: 1,
  });
  const refresh = useDashboardReadRefresh(workspaceId, userId);
  if (overview.data === undefined)
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">{t("dashboard.title")}</h1>
        <PanelFeedback
          state={dashboardLoadState(overview)}
          label={t("dashboard.overview")}
          onRetry={() => void overview.refetch()}
        >
          <></>
        </PanelFeedback>
      </div>
    );
  const data = overview.data;
  const gettingStarted = needsDashboardSetup(data.counts);
  const loadAdvanced = shouldLoadDashboardAdvanced({
    hasOverview: true,
    gettingStarted,
    open: advancedOpen,
  });
  const advanced = loadAdvanced ? (
    <DashboardAdvanced workspaceId={workspaceId} userId={userId} overview={data} />
  ) : null;
  return (
    <PageTransition>
      <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-6">
        {gettingStarted && (
          <GettingStartedSection
            counts={data.counts}
            canEdit={canEdit}
            canManage={canManage}
            onResume={
              canEdit && data.counts.brands === 0
                ? () => window.dispatchEvent(new Event("digitalos:onboarding-start"))
                : undefined
            }
          />
        )}
        <DashboardHeader
          compact={gettingStarted}
          onRefresh={() => void refresh.refresh()}
          isPending={refresh.isFetching}
        />
        <p className="text-xs text-muted-foreground">{t("dashboard.readOnlyRefreshHint")}</p>
        {refresh.result !== "idle" && (
          <p
            role="status"
            className={`text-sm ${refresh.result === "partial" ? "text-warning" : "text-muted-foreground"}`}
          >
            {t(
              refresh.result === "partial"
                ? "dashboard.refreshedPartial"
                : "dashboard.refreshedData",
            )}
          </p>
        )}
        <PanelFeedback
          state={dashboardLoadState(overview)}
          label={t("dashboard.overview")}
          onRetry={() => void overview.refetch()}
        >
          <div className="space-y-4">
            <KpiFooterSection
              brands={data.counts.brands}
              channelsConnected={data.counts.channelsConnected}
              channels={data.counts.channels}
              content={data.counts.content}
              scheduled={data.counts.upcomingJobs}
            />
            {(!gettingStarted || data.counts.upcomingJobs > 0) && (
              <UpcomingJobsSection jobs={data.upcomingJobs} total={data.counts.upcomingJobs} />
            )}
            <p className="text-xs text-muted-foreground">
              {t("dashboard.checkedAt", {
                date:
                  dashboardDate(data.checkedAt, i18n.language) ?? t("dashboard.dateUnavailable"),
              })}
            </p>
          </div>
        </PanelFeedback>
        {gettingStarted ? (
          <details
            open={advancedOpen}
            onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
            className="section-card p-5"
          >
            <summary className="min-h-11 cursor-pointer text-sm font-semibold">
              {t("gettingStarted.advanced")}
            </summary>
            <p className="mb-6 mt-2 text-sm text-muted-foreground">
              {t("gettingStarted.advancedHint")}
            </p>
            {advanced}
          </details>
        ) : (
          advanced
        )}
        <p className="text-xs text-muted-foreground">{t("dashboard.dataHint")}</p>
      </motion.div>
    </PageTransition>
  );
}
