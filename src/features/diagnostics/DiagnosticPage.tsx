import { Activity, TrendingUp, RefreshCw, Calculator } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageTransition } from "@/components/app/Motion";
import { PageHeader } from "@/components/app/PageHeader";
import { PageSkeleton } from "@/components/app/Skeletons";
import { useWorkspaceAccess } from "@/lib/workspace/use-workspace-access";
import { useCurrentWorkspaceId } from "@/lib/workspace/use-workspace";
import type { DiagnosticKind } from "@/lib/diagnostics/contracts";
import { canReadDiagnostics } from "./presentation";
import { useDiagnosticWorkspace } from "./hooks/use-diagnostic-workspace";
import { DiagnosticFeedback } from "./components/DiagnosticFeedback";
import { DiagnosticReadState } from "./components/DiagnosticReadState";
import { DiagnosticResults } from "./components/DiagnosticResults";

export function DiagnosticPage({ kind }: { kind: DiagnosticKind }) {
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
  if (access.isError || !canReadDiagnostics(access.role))
    return (
      <section role="alert" className="space-y-3 rounded-xl border border-border p-6">
        <h1 className="text-xl font-semibold">{t("diagnostics.accessUnavailable")}</h1>
        <p className="text-sm text-muted-foreground">{t("diagnostics.accessHint")}</p>
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
    <DiagnosticWorkspace
      key={`${kind}:${access.userId}:${workspaceId}`}
      kind={kind}
      workspaceId={workspaceId}
      userId={access.userId}
      canEdit={access.canEdit}
    />
  );
}
function DiagnosticWorkspace({
  kind,
  workspaceId,
  userId,
  canEdit,
}: {
  kind: DiagnosticKind;
  workspaceId: string;
  userId: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const model = useDiagnosticWorkspace(kind, workspaceId, userId, canEdit);
  const busy = model.pending !== null;
  const fetching = model.query.isFetching;
  return (
    <PageTransition>
      <div className="min-w-0 space-y-5">
        <PageHeader
          icon={kind === "health" ? Activity : TrendingUp}
          eyebrow={t(`diagnostics.${kind}.eyebrow`)}
          title={t(`diagnostics.${kind}.title`)}
          subtitle={t(`diagnostics.${kind}.subtitle`)}
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
              {t("diagnostics.refresh")}
            </button>
          }
        />
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("diagnostics.scopeHint")}
        </p>
        {!canEdit && (
          <p role="status" className="rounded-xl border border-border p-4 text-sm">
            {t("diagnostics.viewerHint")}
          </p>
        )}
        {canEdit && (
          <section className="flex min-w-0 flex-col items-start gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-sm text-muted-foreground">{t("diagnostics.computeHint")}</p>
            <button
              type="button"
              onClick={() => void model.compute()}
              disabled={!model.canCompute}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Calculator aria-hidden="true" className="size-4" />
              {t(model.pending === "compute" ? "diagnostics.computing" : "diagnostics.compute")}
            </button>
          </section>
        )}
        <DiagnosticFeedback
          feedback={model.feedback}
          review={model.review}
          confirmed={model.reviewConfirmed}
          onConfirm={model.setReviewConfirmed}
          onRefresh={() => void model.refresh()}
          onResume={model.resume}
          busy={busy || fetching}
          canEdit={canEdit}
        />
        <DiagnosticReadState
          hasData={model.query.data !== undefined}
          isError={model.query.isError}
          isFetching={fetching}
          busy={busy}
          onRetry={() => void model.refresh()}
        >
          {model.query.data && <DiagnosticResults data={model.query.data} />}
        </DiagnosticReadState>
      </div>
    </PageTransition>
  );
}
