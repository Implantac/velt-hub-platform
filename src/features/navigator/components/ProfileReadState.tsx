import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { navigatorReadState } from "../presentation";

export function ProfileReadState({
  data,
  isError,
  isFetching,
  busy,
  onRetry,
  children,
}: {
  data: unknown;
  isError: boolean;
  isFetching: boolean;
  busy: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation(),
    state = navigatorReadState({ data, isError });
  const retry = (
    <button
      type="button"
      onClick={onRetry}
      disabled={busy || isFetching}
      className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
    >
      {t("navigatorNative.retry")}
    </button>
  );
  if (state === "loading")
    return (
      <p role="status" className="rounded-xl border border-border p-5 text-sm">
        {t("navigatorNative.loading")}
      </p>
    );
  if (state === "error")
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-border p-5">
        <p className="text-sm">{t("navigatorNative.readError")}</p>
        {retry}
      </div>
    );
  return (
    <div aria-busy={isFetching} className="min-w-0 space-y-4">
      {state === "stale" && (
        <div role="alert" className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-sm">{t("navigatorNative.stale")}</p>
          {retry}
        </div>
      )}
      {isFetching && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("navigatorNative.reading")}
        </p>
      )}
      {children}
    </div>
  );
}
