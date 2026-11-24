import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LearningPage } from "@/lib/learning/contracts";

export function LearningReadState({
  data,
  catalogError,
  progressError,
  progressConfirmed,
  fetching,
  onRead,
  children,
}: {
  data: LearningPage | undefined;
  catalogError: boolean;
  progressError: boolean;
  progressConfirmed: boolean;
  fetching: boolean;
  onRead: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (!data)
    return (
      <div
        role={catalogError ? "alert" : "status"}
        className="space-y-3 rounded-xl border border-border p-4 text-sm"
      >
        <p>{t(catalogError ? "learningNative.catalogError" : "learningNative.catalogLoading")}</p>
        {catalogError && (
          <button
            type="button"
            onClick={onRead}
            disabled={fetching}
            className="min-h-11 rounded-lg border border-border px-4 py-2 disabled:opacity-50"
          >
            {t("learningNative.retry")}
          </button>
        )}
      </div>
    );
  return (
    <div aria-busy={fetching} className="space-y-4">
      {catalogError && (
        <p role="alert" className="rounded-xl border border-border p-4 text-sm">
          {t("learningNative.catalogStale")}
        </p>
      )}
      {fetching && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("learningNative.reading")}
        </p>
      )}
      {data.items.length > 0 &&
        (progressError ? (
          <p role="alert" className="rounded-xl border border-border p-4 text-sm">
            {t(progressConfirmed ? "learningNative.progressStale" : "learningNative.progressError")}
          </p>
        ) : (
          !progressConfirmed && (
            <p role="status" className="text-sm">
              {t("learningNative.progressLoading")}
            </p>
          )
        ))}
      {data.items.length === 0 && !catalogError && (
        <p role="status" className="rounded-xl border border-dashed border-border p-5 text-sm">
          {t(data.total === 0 ? "learningNative.catalogEmpty" : "learningNative.pageGone")}
        </p>
      )}
      {children}
    </div>
  );
}
