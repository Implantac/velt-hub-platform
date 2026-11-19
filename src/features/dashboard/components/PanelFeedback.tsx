import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { DashboardLoadState } from "../presentation";

export function PanelFeedback({
  state,
  label,
  onRetry,
  children,
}: {
  state: DashboardLoadState;
  label: string;
  onRetry: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (state === "loading")
    return (
      <p
        role="status"
        className="rounded-xl border border-border bg-secondary/30 p-4 text-sm text-muted-foreground"
      >
        {t("dashboard.loadingPanel", { panel: label })}
      </p>
    );
  if (state === "error")
    return (
      <div
        role="alert"
        className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
      >
        <p>{t("dashboard.unavailablePanel", { panel: label })}</p>
        <button
          type="button"
          onClick={onRetry}
          aria-label={t("dashboard.retryPanel", { panel: label })}
          className="min-h-11 rounded-lg border border-border px-4 py-2 font-semibold hover:bg-secondary"
        >
          {t("common.tryAgain")}
        </button>
      </div>
    );
  return (
    <>
      {state === "stale" && (
        <div className="mb-3 space-y-1 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
          <p role="status">{t("dashboard.stalePanel", { panel: label })}</p>
          <button
            type="button"
            onClick={onRetry}
            aria-label={t("dashboard.retryPanel", { panel: label })}
            className="min-h-11 font-semibold text-primary underline underline-offset-4"
          >
            {t("common.tryAgain")}
          </button>
        </div>
      )}
      {children}
    </>
  );
}
