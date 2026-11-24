import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { nativeNavigatorPlan, type NavigatorRecord } from "@/lib/navigator/contracts";
import { legacyNavigatorActions, navigatorDate, navigatorInternalHref } from "../presentation";
import { ProfileAnswers } from "./ProfileAnswers";

export function ProfileSummary({
  profile,
  onRetake,
  canEdit,
}: {
  profile: NavigatorRecord;
  onRetake: () => void;
  canEdit: boolean;
}) {
  const { t, i18n } = useTranslation(),
    method = nativeNavigatorPlan(profile),
    legacy = legacyNavigatorActions(profile.recommended_actions);
  const actions = method
    ? method.actions.map((action) => ({
        title: t(`navigatorNative.actions.${action.navigator.code}`),
        href: navigatorInternalHref(action.href),
      }))
    : legacy.items;
  return (
    <section
      aria-label={t("navigatorNative.summaryTitle")}
      className="min-w-0 space-y-5 [overflow-wrap:anywhere]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("navigatorNative.summaryTitle")}</h2>
        <button
          type="button"
          onClick={onRetake}
          disabled={!canEdit}
          className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {t("navigatorNative.edit")}
        </button>
      </div>
      <ProfileAnswers answers={profile} />
      <p className="text-xs text-muted-foreground">
        {t("navigatorNative.savedAt")}{" "}
        <time dateTime={profile.updated_at}>
          {navigatorDate(profile.updated_at, i18n.language)}
        </time>{" "}
        · America/Sao_Paulo
      </p>
      {!method && (
        <p className="rounded-xl border border-border p-4 text-sm">
          {t("navigatorNative.legacyHint")}
        </p>
      )}
      <section aria-label={t("navigatorNative.actionsTitle")} className="space-y-3">
        <h3 className="font-semibold">{t("navigatorNative.actionsTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("navigatorNative.actionsHint")}</p>
        {actions.length ? (
          <ol className="space-y-2">
            {actions.map((action, index) => (
              <li
                key={index}
                className="flex min-w-0 flex-col items-start gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="min-w-0 text-sm font-medium">
                  {index + 1}. {action.title}
                </span>
                {action.href && (
                  <Link
                    to={action.href}
                    aria-label={t("navigatorNative.openAction", { title: action.title })}
                    className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-border px-3 py-2 text-sm font-semibold"
                  >
                    {t("navigatorNative.openModule")} →
                  </Link>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{t("navigatorNative.noReadableActions")}</p>
        )}
        {!method && legacy.total > legacy.items.length && (
          <p className="text-xs text-muted-foreground">
            {t("navigatorNative.legacyPreview", {
              count: legacy.items.length,
              total: legacy.total,
            })}
          </p>
        )}
      </section>
      <details className="rounded-xl border border-border p-4 text-sm">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          {t("navigatorNative.methodSummary")}
        </summary>
        <div className="mt-3 space-y-3 text-muted-foreground">
          <p>{t(method ? "navigatorNative.methodHint" : "navigatorNative.legacyMethod")}</p>
          {method && (
            <>
              <p className="font-semibold text-foreground">{method.model}</p>
              <p>
                {t("navigatorNative.revisionReference")} <code>{method.revisionId}</code>
              </p>
            </>
          )}
          <p>
            {t("navigatorNative.compatibilityLabel")}{" "}
            <strong className="text-foreground">{profile.maturity_level}</strong>
          </p>
          <p>{t("navigatorNative.compatibilityHint")}</p>
        </div>
      </details>
    </section>
  );
}
