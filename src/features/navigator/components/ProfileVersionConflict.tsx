import { useId } from "react";
import { useTranslation } from "react-i18next";
import { nativeNavigatorPlan, type NavigatorRecord } from "@/lib/navigator/contracts";
import { navigatorDate } from "../presentation";
import { ProfileAnswers } from "./ProfileAnswers";

export function ProfileVersionConflict({
  current,
  confirmed,
  onConfirm,
  onLoad,
  onAdopt,
  disabled,
  canAdopt,
}: {
  current: NavigatorRecord | null;
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
  onLoad: () => void;
  onAdopt: () => void;
  disabled: boolean;
  canAdopt: boolean;
}) {
  const { t, i18n } = useTranslation(),
    id = useId(),
    method = current ? nativeNavigatorPlan(current) : null;
  return (
    <section
      aria-label={t("navigatorNative.versionTitle")}
      className="min-w-0 space-y-3 rounded-xl border border-border p-4 text-sm [overflow-wrap:anywhere]"
    >
      <h2 className="font-semibold">{t("navigatorNative.versionTitle")}</h2>
      <p>{t("navigatorNative.versionHint")}</p>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          {t("navigatorNative.currentRead")}
        </summary>
        {current ? (
          <div className="space-y-3">
            <ProfileAnswers answers={current} />
            <p className="text-xs text-muted-foreground">
              {t("navigatorNative.savedAt")}{" "}
              <time dateTime={current.updated_at}>
                {navigatorDate(current.updated_at, i18n.language)}
              </time>{" "}
              · America/Sao_Paulo
            </p>
            {method && (
              <p className="text-xs">
                {method.model} · {t("navigatorNative.revisionReference")}{" "}
                <code>{method.revisionId}</code>
              </p>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">{t("navigatorNative.currentAbsent")}</p>
        )}
      </details>
      <button
        type="button"
        onClick={onLoad}
        disabled={disabled}
        className="min-h-11 rounded-lg border border-border px-4 py-2 font-semibold disabled:opacity-50"
      >
        {t("navigatorNative.loadLatest")}
      </button>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
        <input
          id={id}
          type="checkbox"
          checked={confirmed}
          onChange={(event) => onConfirm(event.target.checked)}
          disabled={disabled || !canAdopt}
          className="mt-1 size-5 shrink-0 accent-primary"
        />
        <span>{t("navigatorNative.rebaseAcknowledge")}</span>
      </label>
      <button
        type="button"
        onClick={onAdopt}
        disabled={disabled || !canAdopt || !confirmed}
        className="min-h-11 rounded-lg border border-border px-4 py-2 font-semibold disabled:opacity-50"
      >
        {t("navigatorNative.adoptLatest")}
      </button>
    </section>
  );
}
