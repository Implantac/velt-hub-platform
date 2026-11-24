import { useRef } from "react";
import { Circle, ClipboardList, RefreshCw, Scale } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageTransition } from "@/components/app/Motion";
import { PageSkeleton } from "@/components/app/Skeletons";
import { useWorkspaceAccess } from "@/lib/workspace/use-workspace-access";
import { useCurrentWorkspaceId } from "@/lib/workspace/use-workspace";
import { SKILL_AREAS, SKILL_METHOD, skillAssessmentFor } from "@/lib/skill-map/contracts";
import { canReadSkillMap, skillDate, skillStats } from "./presentation";
import { useSkillMap } from "./hooks/use-skill-map";
import { SkillCard } from "./components/SkillCard";
import { SkillStat } from "./components/SkillStat";
import { SkillMapReadState } from "./components/SkillMapReadState";
import { SkillAssessmentEditor } from "./components/SkillAssessmentEditor";
import { SkillFeedback } from "./components/SkillFeedback";
import { SkillMapLocationHeader, type SkillMapPlacement } from "./SkillMapLocationHeader";

export function SkillMapSurface({ placement = "page" }: { placement?: SkillMapPlacement }) {
  const { t } = useTranslation(),
    [workspaceId] = useCurrentWorkspaceId(),
    access = useWorkspaceAccess();
  const AccessHeading = placement === "panel" ? "h2" : "h1";
  if (access.authLoading || (access.userId && workspaceId && access.isPending))
    return (
      <div role="status" aria-label={t("access.checking")}>
        <PageSkeleton stats={0} rows={4} />
      </div>
    );
  if (!workspaceId || !access.userId)
    return (
      <p role="status" className="p-6 text-sm">
        {t("common.noWorkspace")}
      </p>
    );
  if (access.isError || !canReadSkillMap(access.role))
    return (
      <section role="alert" className="space-y-3 rounded-xl border border-border p-6">
        <AccessHeading className="text-xl font-semibold">
          {t("skillMapNative.accessUnavailable")}
        </AccessHeading>
        <p className="text-sm text-muted-foreground">{t("skillMapNative.accessHint")}</p>
        <button
          type="button"
          onClick={access.retry}
          disabled={access.isFetching}
          className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {t("common.tryAgain")}
        </button>
      </section>
    );
  return (
    <PersonalSkillMap
      key={`${placement}:${access.userId}:${workspaceId}`}
      placement={placement}
      userId={access.userId}
      workspaceId={workspaceId}
    />
  );
}
function PersonalSkillMap({
  userId,
  workspaceId,
  placement,
}: {
  userId: string;
  workspaceId: string;
  placement: SkillMapPlacement;
}) {
  const { t, i18n } = useTranslation(),
    model = useSkillMap(userId, workspaceId),
    origin = useRef<HTMLButtonElement | null>(null),
    refresh = useRef<HTMLButtonElement>(null);
  const focusBack = () =>
    queueMicrotask(() => (origin.current?.isConnected ? origin.current : refresh.current)?.focus());
  const stats = model.query.data ? skillStats(model.query.data) : null;
  const sectionHeading = placement === "panel" ? "h3" : "h2";
  const content = (
    <div data-skill-surface={placement} className="mx-auto min-w-0 max-w-5xl space-y-5">
      <SkillMapLocationHeader
        placement={placement}
        action={
          <button
            ref={refresh}
            type="button"
            onClick={() => void model.refresh()}
            disabled={model.busy || model.query.isFetching}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-4 ${model.operation.reading ? "animate-spin" : ""}`}
            />
            {t("skillMapNative.refresh")}
          </button>
        }
      />
      <p className="rounded-xl border border-border p-4 text-sm leading-relaxed">
        {t("skillMapNative.scopeHint")}
      </p>
      <SkillFeedback
        headingAs={sectionHeading}
        operation={model.operation}
        receipt={model.view.receipt}
        readReady={model.readReady}
        confirmed={model.reviewConfirmed}
        onConfirm={model.setReviewConfirmed}
        onRead={() => void model.refresh()}
        onResume={() => {
          model.resume();
          focusBack();
        }}
        busy={model.busy || model.query.isFetching}
      />
      {model.editor && (
        <SkillAssessmentEditor
          headingAs={sectionHeading}
          editor={model.editor}
          readReady={model.readReady}
          matches={model.matches}
          busy={model.busy}
          blocked={!!model.operation.review}
          canReview={model.canReview}
          canSave={model.canSave}
          needsSave={model.needsSave}
          acknowledged={model.acknowledged}
          onAcknowledge={model.setAcknowledged}
          onChange={model.changeDraft}
          onStep={model.setStep}
          onSave={() => void model.save()}
          onCancel={() => {
            model.cancel();
            focusBack();
          }}
          onLoadLatest={model.loadLatest}
        />
      )}
      <SkillMapReadState
        headingAs={sectionHeading}
        data={model.query.data}
        isError={model.query.isError}
        isFetching={model.query.isFetching}
        busy={model.busy}
        onRead={() => void model.refresh()}
      >
        {model.query.data && stats && (
          <>
            <div className="grid min-w-0 gap-3 sm:grid-cols-3">
              <SkillStat
                label={t("skillMapNative.stats.assessed")}
                value={t("skillMapNative.assessedCount", {
                  count: stats.assessed,
                  total: SKILL_AREAS.length,
                })}
                icon={ClipboardList}
              />
              <SkillStat
                label={t("skillMapNative.stats.unassessed")}
                value={stats.unassessed}
                icon={Circle}
              />
              <SkillStat label={t("skillMapNative.stats.high")} value={stats.high} icon={Scale} />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("skillMapNative.checkedAt")}{" "}
              <time dateTime={model.query.data.checkedAt}>
                {skillDate(model.query.data.checkedAt, i18n.language)}
              </time>
            </p>
            <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {SKILL_AREAS.map((area) => (
                <SkillCard
                  headingAs={sectionHeading}
                  idPrefix={placement === "panel" ? "brain-lab-skill" : "skill"}
                  key={area}
                  area={area}
                  row={skillAssessmentFor(model.query.data!, area)}
                  disabled={!model.canChoose}
                  onChoose={(button) => {
                    origin.current = button;
                    model.choose(area);
                  }}
                />
              ))}
            </div>
          </>
        )}
      </SkillMapReadState>
      <details className="rounded-xl border border-border p-4 text-sm">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          {t("skillMapNative.methodTitle")}
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          <code>{SKILL_METHOD}</code>
        </p>
        <ul className="mt-3 list-disc space-y-3 pl-5 leading-relaxed text-muted-foreground">
          {["methodBands", "methodCurrent", "methodTechnical", "methodBrain", "methodLimits"].map(
            (key) => (
              <li key={key}>{t(`skillMapNative.${key}`)}</li>
            ),
          )}
        </ul>
      </details>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("skillMapNative.runtimeHint")}
      </p>
    </div>
  );
  return placement === "page" ? <PageTransition>{content}</PageTransition> : content;
}
