import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { CoachPanel } from "@/lib/coach/contracts";
import { coachDate, coachLanguage, coachPageRange, coachReadState } from "../presentation";

type Props = {
  panel: CoachPanel;
  data: { page: number; total: number; checkedAt: string; items: unknown[] } | undefined;
  requestedPage: number;
  isError: boolean;
  isFetching: boolean;
  busy: boolean;
  onRetry: () => void;
  onPage: (page: number) => void;
  children: ReactNode;
};
export function CoachResults({
  panel,
  data,
  requestedPage,
  isError,
  isFetching,
  busy,
  onRetry,
  onPage,
  children,
}: Props) {
  const { t, i18n } = useTranslation(),
    state = coachReadState({ data, isError }),
    disabled = busy || isFetching;
  const retry = (
    <button
      type="button"
      onClick={onRetry}
      disabled={disabled}
      className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
    >
      {t("coachNative.retry")}
    </button>
  );
  if (state === "loading")
    return (
      <p role="status" className="rounded-xl border border-border p-5 text-sm">
        {t(`coachNative.${panel}.loading`)}
      </p>
    );
  if (state === "error" || !data)
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-border p-5">
        <p className="text-sm">{t(`coachNative.${panel}.readError`)}</p>
        <div className="flex flex-wrap gap-2">
          {retry}
          {requestedPage > 1 && (
            <button
              type="button"
              onClick={() => onPage(1)}
              disabled={disabled}
              className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {t("coachNative.firstPage")}
            </button>
          )}
        </div>
      </div>
    );
  const range = coachPageRange(data),
    number = new Intl.NumberFormat(coachLanguage(i18n.language));
  return (
    <div
      role="region"
      aria-label={t(`coachNative.${panel}.results`)}
      aria-busy={isFetching}
      className="min-w-0 space-y-4"
    >
      {state === "stale" && (
        <div role="alert" className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-sm">{t(`coachNative.${panel}.stale`)}</p>
          {retry}
        </div>
      )}
      {isFetching && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("coachNative.reading")}
        </p>
      )}
      <div className="space-y-1 text-xs text-muted-foreground">
        <p role="status" className="text-sm font-medium text-foreground">
          {t("coachNative.range", {
            start: number.format(range.start),
            end: number.format(range.end),
            total: number.format(data.total),
          })}
        </p>
        <p>{t("coachNative.checkedAt", { date: coachDate(data.checkedAt, i18n.language) })}</p>
        <p>{t("coachNative.pageHint")}</p>
      </div>
      {range.outOfRange ? (
        <div role="status" className="space-y-3 rounded-xl border border-border p-5">
          <p className="text-sm">{t("coachNative.pageOutOfRange")}</p>
          <button
            type="button"
            onClick={() => onPage(1)}
            disabled={disabled}
            className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {t("coachNative.firstPage")}
          </button>
        </div>
      ) : data.items.length === 0 ? (
        <div role="status" className="space-y-2 rounded-xl border border-dashed border-border p-5">
          <p className="font-semibold">{t(`coachNative.${panel}.emptyTitle`)}</p>
          <p className="text-sm text-muted-foreground">{t(`coachNative.${panel}.emptyHint`)}</p>
        </div>
      ) : (
        children
      )}
      <nav
        aria-label={t(`coachNative.${panel}.pagination`)}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <p className="text-sm text-muted-foreground">
          {t("coachNative.pageNumber", {
            page: number.format(data.page),
            pages: number.format(range.pages),
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onPage(data.page - 1)}
            disabled={disabled || !range.hasPrevious}
            className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {t("coachNative.previous")}
          </button>
          <button
            type="button"
            onClick={() => onPage(data.page + 1)}
            disabled={disabled || !range.hasNext}
            className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {t("coachNative.next")}
          </button>
        </div>
      </nav>
      {range.reachedPageLimit && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("coachNative.pageLimit")}
        </p>
      )}
    </div>
  );
}
