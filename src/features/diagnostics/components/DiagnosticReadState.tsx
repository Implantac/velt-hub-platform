import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function DiagnosticReadState({
  hasData,
  isError,
  isFetching,
  busy,
  onRetry,
  children,
}: {
  hasData: boolean;
  isError: boolean;
  isFetching: boolean;
  busy: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 space-y-4" aria-busy={isFetching}>
      {!hasData && !isError && (
        <p role="status" className="rounded-xl border border-border p-6">
          {t("diagnostics.loading")}
        </p>
      )}
      {isError && (
        <section role="alert" className="space-y-3 rounded-xl border border-border p-4">
          <p>{t(hasData ? "diagnostics.stale" : "diagnostics.readError")}</p>
          <button
            type="button"
            onClick={onRetry}
            disabled={busy || isFetching}
            className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {t("diagnostics.retry")}
          </button>
        </section>
      )}
      {hasData && !isError && isFetching && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("diagnostics.refreshing")}
        </p>
      )}
      {hasData && children}
    </div>
  );
}
