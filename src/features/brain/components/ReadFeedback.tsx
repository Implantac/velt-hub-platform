import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { BrainReadState } from "../presentation";

type Props = {
  state: BrainReadState;
  label: string;
  isFetching: boolean;
  onRetry: () => void;
  children: ReactNode;
};
export function ReadFeedback({ state, label, isFetching, onRetry, children }: Props) {
  const { t } = useTranslation();
  if (state === "loading")
    return (
      <p role="status" className="py-6 text-sm text-muted-foreground">
        {t("brainNative.loading", { panel: label })}
      </p>
    );
  const retry = (
    <button
      type="button"
      onClick={onRetry}
      disabled={isFetching}
      className="mt-2 min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
      aria-label={t("brainNative.retryPanel", { panel: label })}
    >
      {t("common.tryAgain")}
    </button>
  );
  if (state === "error")
    return (
      <div role="alert" className="rounded-xl border border-border p-4">
        <p className="text-sm">{t("brainNative.readFailed", { panel: label })}</p>
        {retry}
      </div>
    );
  return (
    <div className="space-y-3" aria-busy={isFetching}>
      {state === "stale" && (
        <div role="status" className="rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm">
          <p>{t("brainNative.stale", { panel: label })}</p>
          {retry}
        </div>
      )}
      {state === "ready" && isFetching && (
        <p role="status" className="text-xs text-muted-foreground">
          {t("brainNative.refreshing")}
        </p>
      )}
      {children}
    </div>
  );
}
