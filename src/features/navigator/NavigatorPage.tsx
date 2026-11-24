import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageTransition } from "@/components/app/Motion";
import { PageSkeleton } from "@/components/app/Skeletons";
import { useAuth } from "@/lib/auth/use-auth";
import { useNavigatorProfile } from "./hooks/use-navigator-profile";
import { NavigatorHeader } from "./components/atoms";
import { ProfileSummary } from "./components/ProfileSummary";
import { ProfileReadState } from "./components/ProfileReadState";
import { ProfileFeedback } from "./components/ProfileFeedback";
import { ProfileEditor } from "./components/ProfileEditor";
import { ProfileVersionConflict } from "./components/ProfileVersionConflict";

export function NavigatorPage() {
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
      <p role="status" className="p-8 text-sm">
        {t("navigatorNative.sessionUnavailable")}
      </p>
    );
  return <PersonalNavigator key={user.id} userId={user.id} />;
}
function PersonalNavigator({ userId }: { userId: string }) {
  const { t } = useTranslation(),
    model = useNavigatorProfile(userId);
  const { editor, profile, query } = model;
  const invalidFields =
    model.parsed && !model.parsed.success
      ? [...new Set(model.parsed.error.issues.map((issue) => String(issue.path[0])))]
      : [];
  return (
    <PageTransition>
      <div className="mx-auto min-w-0 max-w-4xl space-y-5">
        <NavigatorHeader
          action={
            <button
              type="button"
              onClick={() => void model.refresh()}
              disabled={model.busy || query.isFetching}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-4 ${model.reading ? "animate-spin" : ""}`}
              />
              {t("navigatorNative.refresh")}
            </button>
          }
        />
        <p className="rounded-xl border border-border p-4 text-sm leading-relaxed">
          {t("navigatorNative.personalHint")}
        </p>
        <ProfileFeedback
          operation={model.operation}
          confirmed={model.reviewConfirmed}
          onConfirm={model.setReviewConfirmed}
          onRefresh={() => void model.refresh()}
          onResume={model.resume}
          busy={model.busy || query.isFetching}
          readReady={model.readReady}
        />
        <ProfileReadState
          data={profile}
          isError={query.isError}
          isFetching={query.isFetching}
          busy={model.busy}
          onRetry={() => void model.refresh()}
        >
          {!editor && profile && (
            <ProfileSummary
              profile={profile}
              onRetake={model.start}
              canEdit={model.readReady && !model.busy && !model.operation.review}
            />
          )}
          {!editor && profile === null && !query.isError && (
            <section
              aria-label={t("navigatorNative.emptyTitle")}
              className="space-y-3 rounded-xl border border-dashed border-border p-5"
            >
              <h2 className="font-semibold">{t("navigatorNative.emptyTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("navigatorNative.emptyHint")}</p>
              <button
                type="button"
                onClick={model.start}
                disabled={!model.readReady || model.busy || !!model.operation.review}
                className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {t("navigatorNative.start")}
              </button>
            </section>
          )}
          {!editor && profile === null && query.isError && (
            <p className="text-sm text-muted-foreground">{t("navigatorNative.staleAbsent")}</p>
          )}
        </ProfileReadState>
        {editor && (
          <>
            {!model.versionMatches && model.readReady && (
              <ProfileVersionConflict
                current={query.data!}
                confirmed={model.rebaseConfirmed}
                onConfirm={model.setRebaseConfirmed}
                onLoad={model.loadLatest}
                onAdopt={model.adoptLatest}
                disabled={model.busy}
                canAdopt={!model.operation.review}
              />
            )}
            <ProfileEditor
              form={editor.draft}
              reviewAnswers={model.parsed?.success ? model.parsed.data : undefined}
              step={editor.step}
              invalidFields={invalidFields}
              disabled={model.operation.pending}
              confirmationDisabled={
                model.busy || !model.readReady || !model.versionMatches || !!model.operation.review
              }
              canSave={model.canSave}
              needsSave={model.needsSave}
              acknowledged={model.acknowledged}
              onAcknowledge={model.setAcknowledged}
              onChange={model.changeDraft}
              onStep={model.setStep}
              onSave={() => void model.save()}
              onCancel={model.cancel}
            />
          </>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("navigatorNative.concurrencyHint")}
        </p>
      </div>
    </PageTransition>
  );
}
