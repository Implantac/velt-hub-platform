import { Brain, History, RefreshCw, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageTransition } from "@/components/app/Motion";
import { PageHeader } from "@/components/app/PageHeader";
import { PageSkeleton } from "@/components/app/Skeletons";
import { useWorkspaceAccess } from "@/lib/workspace/use-workspace-access";
import { useCurrentWorkspaceId } from "@/lib/workspace/use-workspace";
import { COACH_FILTERS, type CoachFilter } from "@/lib/coach/contracts";
import { canReadCoach } from "./presentation";
import { useCoachWorkspace } from "./hooks/use-coach-workspace";
import { RecommendationsList } from "./components/RecommendationsList";
import { JourneyTimeline } from "./components/JourneyTimeline";
import { CoachResults } from "./components/CoachResults";
import { CoachConfirmation } from "./components/CoachConfirmation";
import { CoachFeedback } from "./components/CoachFeedback";

export function CoachPage() {
  const { t } = useTranslation();
  const [workspaceId] = useCurrentWorkspaceId();
  const access = useWorkspaceAccess();
  if (access.authLoading || (access.userId && workspaceId && access.isPending))
    return (
      <div role="status" aria-label={t("access.checking")}>
        <PageSkeleton stats={0} rows={4} />
      </div>
    );
  if (!workspaceId || !access.userId)
    return (
      <p role="status" className="p-8 text-muted-foreground">
        {t("common.noWorkspace")}
      </p>
    );
  if (access.isError || !canReadCoach(access.role))
    return (
      <section role="alert" className="space-y-3 rounded-xl border border-border p-6">
        <h1 className="text-xl font-semibold">{t("coachNative.accessUnavailable")}</h1>
        <p className="text-sm text-muted-foreground">{t("coachNative.accessHint")}</p>
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
    <CoachWorkspace
      key={`${access.userId}:${workspaceId}`}
      workspaceId={workspaceId}
      userId={access.userId}
      canEdit={access.canEdit}
    />
  );
}
function CoachWorkspace({
  workspaceId,
  userId,
  canEdit,
}: {
  workspaceId: string;
  userId: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const model = useCoachWorkspace(workspaceId, userId, canEdit);
  const recDisabled = model.busy || model.query.isFetching;
  return (
    <PageTransition>
      <div className="min-w-0 space-y-6">
        <PageHeader
          icon={Brain}
          eyebrow={t("coachNative.eyebrow")}
          title={t("coachNative.title")}
          subtitle={t("coachNative.subtitle")}
          action={
            <button
              type="button"
              onClick={() => void model.refresh("recommendations")}
              disabled={recDisabled}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-4 ${model.reading === "recommendations" ? "animate-spin" : ""}`}
              />
              {t("coachNative.refreshRecommendations")}
            </button>
          }
        />
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("coachNative.scopeHint")}
        </p>
        <p className="text-xs text-muted-foreground">{t("coachNative.timeZone")}</p>
        {!canEdit && (
          <p role="status" className="rounded-xl border border-border p-4 text-sm">
            {t("coachNative.viewerHint")}
          </p>
        )}
        {canEdit && (
          <section className="flex min-w-0 flex-col items-start gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-sm leading-relaxed text-muted-foreground">
              {t("coachNative.generateHint")}
            </p>
            <button
              type="button"
              onClick={model.prepareGenerate}
              disabled={!model.canWrite}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Sparkles aria-hidden="true" className="size-4" />
              {t("coachNative.prepareGenerate")}
            </button>
          </section>
        )}
        {canEdit && model.proposal && (
          <CoachConfirmation
            proposal={model.proposal}
            acknowledged={model.acknowledged}
            onAcknowledge={model.setAcknowledged}
            onConfirm={() => void model.confirmProposal()}
            onCancel={model.cancelProposal}
            disabled={!model.canWrite}
          />
        )}
        <CoachFeedback
          operation={model.operation}
          canEdit={canEdit}
          confirmed={model.reviewConfirmed}
          onConfirm={model.setReviewConfirmed}
          onRefresh={() => void model.refresh("recommendations")}
          onResume={model.resume}
          busy={recDisabled}
          readReady={
            model.query.data !== undefined && !model.query.isError && !model.query.isFetching
          }
        />
        <section aria-labelledby="coach-recommendations-title" className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="coach-recommendations-title" className="text-lg font-semibold">
              {t("coachNative.recommendations.title")}
            </h2>
            <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">
              <span>{t("coachNative.filter")}</span>
              <select
                value={model.browse.status}
                onChange={(event) => model.setFilter(event.target.value as CoachFilter)}
                disabled={recDisabled}
                className="min-h-11 max-w-full rounded-lg border border-border bg-background px-3 py-2 disabled:opacity-50"
              >
                {COACH_FILTERS.map((status) => (
                  <option key={status} value={status}>
                    {t(`coachNative.filters.${status}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <CoachResults
            panel="recommendations"
            data={model.query.data}
            requestedPage={model.browse.page}
            isError={model.query.isError}
            isFetching={model.query.isFetching}
            busy={model.busy}
            onRetry={() => void model.refresh("recommendations")}
            onPage={model.setPage}
          >
            {model.query.data && (
              <RecommendationsList
                recs={model.query.data.items}
                canEdit={canEdit}
                canWrite={model.canWrite}
                onPrepare={model.prepareStatus}
              />
            )}
          </CoachResults>
        </section>
        <section
          aria-labelledby="coach-journey-title"
          className="min-w-0 space-y-4 border-t border-border pt-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="coach-journey-title" className="flex items-center gap-2 text-lg font-semibold">
              <History aria-hidden="true" className="size-5" />
              {t("coachNative.journey.title")}
            </h2>
            <button
              type="button"
              onClick={() => void model.refresh("journey")}
              disabled={model.busy || model.timeline.isFetching}
              className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {t("coachNative.refreshJourney")}
            </button>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("coachNative.journeyHint")}
          </p>
          <CoachResults
            panel="journey"
            data={model.timeline.data}
            requestedPage={model.journeyPage}
            isError={model.timeline.isError}
            isFetching={model.timeline.isFetching}
            busy={model.busy}
            onRetry={() => void model.refresh("journey")}
            onPage={model.setTimelinePage}
          >
            {model.timeline.data && <JourneyTimeline events={model.timeline.data.items} />}
          </CoachResults>
        </section>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("coachNative.concurrencyHint")}
        </p>
      </div>
    </PageTransition>
  );
}
