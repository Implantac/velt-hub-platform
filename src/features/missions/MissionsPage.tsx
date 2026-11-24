import { Target, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/app/PageHeader";
import { PageTransition } from "@/components/app/Motion";
import { PageSkeleton } from "@/components/app/Skeletons";
import { useCurrentWorkspaceId } from "@/lib/workspace/use-workspace";
import { useWorkspaceAccess } from "@/lib/workspace/use-workspace-access";
import { canReadMissions } from "./presentation";
import { MissionComposer } from "./components/MissionComposer";
import { MissionFilters } from "./components/MissionFilters";
import { MissionResults } from "./components/MissionResults";
import { MissionMutationFeedback } from "./components/MissionMutationFeedback";
import { useMissionsWorkspace } from "./hooks/use-missions-workspace";

export function MissionsPage() {
  const { t } = useTranslation();
  const [workspaceId] = useCurrentWorkspaceId();
  const access = useWorkspaceAccess();
  if (access.authLoading || (access.userId && workspaceId && access.isPending))
    return (
      <div role="status" aria-label={t("access.checking")}>
        <PageSkeleton stats={0} rows={4} />
      </div>
    );
  if (!access.userId || !workspaceId)
    return (
      <p role="status" className="p-8 text-muted-foreground">
        {t("common.noWorkspace")}
      </p>
    );
  if (access.isError || !canReadMissions(access.role))
    return (
      <section role="alert" className="space-y-3 rounded-xl border border-border p-6">
        <h1 className="text-xl font-semibold">{t("missionsNative.accessUnavailable")}</h1>
        <p className="text-sm text-muted-foreground">{t("missionsNative.accessHint")}</p>
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
    <MissionsWorkspace
      key={`${access.userId}:${workspaceId}`}
      workspaceId={workspaceId}
      userId={access.userId}
      canEdit={access.canEdit}
    />
  );
}

function MissionsWorkspace({
  workspaceId,
  userId,
  canEdit,
}: {
  workspaceId: string;
  userId: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const model = useMissionsWorkspace(workspaceId, userId, canEdit);
  const busy = model.pending !== null;
  const fetching = model.query.isFetching;
  return (
    <PageTransition>
      <div className="min-w-0 space-y-6">
        <PageHeader
          icon={Target}
          eyebrow={t("missionsNative.eyebrow")}
          title={t("missionsNative.title")}
          subtitle={t("missionsNative.subtitle")}
          action={
            <button
              type="button"
              onClick={() => void model.refresh()}
              disabled={busy || fetching}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-4 ${model.pending === "refresh" ? "animate-spin" : ""}`}
              />
              {t("missionsNative.refresh")}
            </button>
          }
        />
        <p className="text-sm text-muted-foreground">{t("missionsNative.manualHint")}</p>
        {!canEdit && (
          <p role="status" className="rounded-xl border border-border p-4 text-sm">
            {t("missionsNative.viewerHint")}
          </p>
        )}
        <MissionMutationFeedback
          feedback={model.feedback}
          review={model.review}
          confirmed={model.reviewConfirmed}
          onConfirm={model.setReviewConfirmed}
          onResume={model.resumeAfterReview}
          onRefresh={() => void model.refresh()}
          disabled={busy || fetching}
          canEdit={canEdit}
        />
        {canEdit && (
          <MissionComposer
            draft={model.draft}
            onChange={model.setDraft}
            onSubmit={() => void model.save()}
            canWrite={model.canWrite}
            busy={busy}
            isSaving={model.pending === "create"}
          />
        )}
        <MissionFilters
          value={model.browse.status}
          disabled={busy || fetching}
          onChange={model.setFilter}
        />
        <MissionResults
          data={model.query.data}
          requestedPage={model.browse.page}
          isError={model.query.isError}
          isFetching={fetching}
          busy={busy}
          canEdit={canEdit}
          canWrite={model.canWrite}
          updatingId={model.updatingId}
          onRetry={() => void model.refresh()}
          onPage={model.setPage}
          onMove={(mission, status) => void model.changeStatus(mission, status)}
        />
        <p className="text-xs text-muted-foreground">{t("missionsNative.scopeHint")}</p>
      </div>
    </PageTransition>
  );
}
