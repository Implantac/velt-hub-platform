import { Brain, RefreshCw, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/app/PageHeader";
import { PageTransition } from "@/components/app/Motion";
import { PageSkeleton } from "@/components/app/Skeletons";
import { useCurrentWorkspaceId } from "@/lib/workspace/use-workspace";
import { useWorkspaceAccess } from "@/lib/workspace/use-workspace-access";
import { RecommendationsPanel } from "./components/RecommendationsPanel";
import { MemoryPanel } from "./components/MemoryPanel";
import { brainLanguage, canReadBrain } from "./presentation";
import { useBrainWorkspace } from "./hooks/use-brain-workspace";

export function BrainPage() {
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
  if (access.isError || !canReadBrain(access.role))
    return (
      <section role="alert" className="space-y-3 rounded-xl border border-border p-6">
        <h1 className="text-xl font-semibold">{t("brainNative.accessUnavailable")}</h1>
        <p className="text-sm text-muted-foreground">{t("brainNative.accessHint")}</p>
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
    <BrainWorkspace
      key={`${access.userId}:${workspaceId}`}
      workspaceId={workspaceId}
      userId={access.userId}
      canEdit={access.canEdit}
    />
  );
}

function BrainWorkspace({
  workspaceId,
  userId,
  canEdit,
}: {
  workspaceId: string;
  userId: string;
  canEdit: boolean;
}) {
  const { t, i18n } = useTranslation();
  const model = useBrainWorkspace(workspaceId, userId, canEdit, brainLanguage(i18n.language));
  const fetching = model.recommendations.isFetching || model.memories.isFetching;
  const busy = model.pending !== null;
  return (
    <PageTransition>
      <div className="space-y-6">
        <PageHeader
          icon={Brain}
          eyebrow={t("brainNative.eyebrow")}
          title="USE Brain"
          subtitle={t("brainNative.subtitle")}
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
              {t("brainNative.refresh")}
            </button>
          }
        />
        <p className="text-sm text-muted-foreground">{t("brainNative.readOnlyHint")}</p>
        {!canEdit && (
          <p role="status" className="rounded-xl border border-border p-4 text-sm">
            {t("brainNative.viewerHint")}
          </p>
        )}
        {model.feedback && (
          <div
            role={model.feedback.kind === "unconfirmed" ? "alert" : "status"}
            className="space-y-2 rounded-xl border border-border p-4 text-sm"
          >
            <p>
              {t(`brainNative.feedback.${model.feedback.kind}`, { count: model.feedback.count })}
            </p>
            {model.feedback.eventMissing && <p>{t("brainNative.eventMissing")}</p>}
            {model.feedback.readFailed && <p>{t("brainNative.savedReadFailed")}</p>}
          </div>
        )}
        {(model.review.recommendations || model.review.memories) && (
          <p role="status" className="text-sm text-muted-foreground">
            {t("brainNative.reviewRequired")}
          </p>
        )}
        {canEdit && (
          <details className="rounded-xl border border-border bg-card/40 p-4">
            <summary className="min-h-11 cursor-pointer text-sm font-semibold">
              {t("brainNative.generateOptions")}
            </summary>
            <div className="mt-2 space-y-4">
              <p className="text-sm text-muted-foreground">{t("brainNative.generateHint")}</p>
              <p className="text-xs text-muted-foreground">{t("brainNative.notSnapshot")}</p>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={model.confirmed}
                  onChange={(event) => model.setConfirmed(event.target.checked)}
                  disabled={busy}
                  className="mt-1 accent-primary"
                />
                <span>{t("brainNative.confirmGeneration")}</span>
              </label>
              <button
                type="button"
                onClick={() => void model.generate()}
                disabled={!model.confirmed || !model.canWriteRecommendations || busy}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Sparkles aria-hidden="true" className="size-4" />
                {t(
                  model.pending === "generate" ? "brainNative.generating" : "brainNative.generate",
                )}
              </button>
            </div>
          </details>
        )}
        <p className="text-xs text-muted-foreground">{t("brainNative.savedLanguageHint")}</p>
        <div className="grid min-w-0 gap-4 lg:grid-cols-5">
          <RecommendationsPanel
            data={model.recommendations.data}
            isError={model.recommendations.isError}
            isFetching={model.recommendations.isFetching}
            canEdit={canEdit}
            canWrite={model.canWriteRecommendations && !busy}
            onRetry={() => void model.retry("recommendations")}
            onSetStatus={(id, status) => void model.setStatus(id, status)}
          />
          <MemoryPanel
            data={model.memories.data}
            isError={model.memories.isError}
            isFetching={model.memories.isFetching}
            canEdit={canEdit}
            canWrite={model.canWriteMemories && !busy}
            memText={model.memText}
            setMemText={model.setMemText}
            memKind={model.memKind}
            setMemKind={model.setMemKind}
            onSubmit={() => void model.saveMemory()}
            isPending={busy}
            isSaving={model.pending === "memory"}
            onRetry={() => void model.retry("memories")}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("brainNative.manualStatusHint")}</p>
        {canEdit && <p className="text-xs text-muted-foreground">{t("brainNative.scopeHint")}</p>}
      </div>
    </PageTransition>
  );
}
