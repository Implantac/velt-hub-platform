import { useRef } from "react";
import { GraduationCap, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageTransition } from "@/components/app/Motion";
import { PageHeader } from "@/components/app/PageHeader";
import { PageSkeleton } from "@/components/app/Skeletons";
import { useAuth } from "@/lib/auth/use-auth";
import { learningProgressFor } from "@/lib/learning/contracts";
import { useLearning } from "./hooks/use-learning";
import { LearningPathCard } from "./components/LearningPathCard";
import { LearningConfirmation } from "./components/LearningConfirmation";
import { LearningFeedback } from "./components/LearningFeedback";
import { LearningReadState } from "./components/LearningReadState";
import { LearningPagination } from "./components/LearningPagination";

export function LearningPage() {
  const { t } = useTranslation(),
    { user, loading } = useAuth();
  if (loading)
    return (
      <div role="status" aria-label={t("access.checking")}>
        <PageSkeleton stats={0} rows={4} />
      </div>
    );
  if (!user)
    return (
      <p role="status" className="p-6 text-sm">
        {t("learningNative.sessionUnavailable")}
      </p>
    );
  return <PersonalLearning key={user.id} userId={user.id} />;
}
function PersonalLearning({ userId }: { userId: string }) {
  const { t } = useTranslation(),
    model = useLearning(userId);
  const origin = useRef<HTMLButtonElement | null>(null),
    refresh = useRef<HTMLButtonElement>(null);
  const focusBack = () =>
    queueMicrotask(() => (origin.current?.isConnected ? origin.current : refresh.current)?.focus());
  return (
    <PageTransition>
      <div className="mx-auto min-w-0 max-w-5xl space-y-5">
        <PageHeader
          icon={GraduationCap}
          eyebrow={t("learningNative.eyebrow")}
          title={t("learningNative.title")}
          subtitle={t("learningNative.subtitle")}
          action={
            <button
              ref={refresh}
              type="button"
              onClick={() => void model.refresh()}
              disabled={model.busy || model.fetching}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-4 ${model.operation.reading ? "animate-spin" : ""}`}
              />
              {t("learningNative.refresh")}
            </button>
          }
        />
        <p className="rounded-xl border border-border p-4 text-sm leading-relaxed">
          {t("learningNative.personalHint")}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("learningNative.catalogHint")}
        </p>
        <LearningFeedback
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
          busy={model.busy || model.fetching}
        />
        {model.view.intent && (
          <LearningConfirmation
            intent={model.view.intent}
            matches={model.intentMatches}
            readReady={model.readReady}
            pending={model.busy}
            blocked={!!model.operation.review}
            acknowledged={model.acknowledged}
            canSave={model.canSave}
            onAcknowledge={model.setAcknowledged}
            onSave={() => void model.save()}
            onCancel={() => {
              model.cancel();
              focusBack();
            }}
          />
        )}
        <LearningReadState
          data={model.catalog.data}
          catalogError={model.catalog.isError}
          progressError={model.progress.isError}
          progressConfirmed={model.progress.data !== undefined}
          fetching={model.fetching}
          onRead={() => void model.refresh()}
        >
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            {model.paths.map((path) => (
              <LearningPathCard
                key={path.id}
                path={path}
                progress={
                  model.progress.data
                    ? learningProgressFor(model.progress.data, path.id)
                    : undefined
                }
                disabled={!model.canChoose}
                onChoose={(milestoneId, button) => {
                  origin.current = button;
                  model.choose(path.id, milestoneId);
                }}
              />
            ))}
          </div>
          {model.catalog.data && (
            <LearningPagination
              data={model.catalog.data}
              onPage={model.changePage}
              disabled={
                !model.readReady || model.busy || !!model.operation.review || !!model.view.intent
              }
            />
          )}
        </LearningReadState>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("learningNative.runtimeHint")}
        </p>
      </div>
    </PageTransition>
  );
}
