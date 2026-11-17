import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

interface Props {
  pageNumber: number;
  shown: number;
  total?: number;
  workspaceTotal?: number;
  pending: boolean;
  disabled: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onRefresh: () => void;
}

export function ContentPagination({
  pageNumber,
  shown,
  total,
  workspaceTotal,
  pending,
  disabled,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  onRefresh,
}: Props) {
  const { t } = useTranslation();
  const button =
    "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-input px-3 py-2 text-sm disabled:opacity-50";
  return (
    <nav className="space-y-3 border-t border-border/70 pt-4" aria-label={t("content.pagination")}>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="text-sm text-muted-foreground"
      >
        {pending
          ? t("content.updatingLibrary")
          : t("content.pageSummary", {
              page: pageNumber,
              shown,
              total: total ?? "—",
              workspaceTotal: workspaceTotal ?? "—",
            })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={button}
          onClick={onPrevious}
          disabled={disabled || !hasPrevious}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {t("content.previousPage")}
        </button>
        <button type="button" className={button} onClick={onNext} disabled={disabled || !hasNext}>
          {t("content.nextPage")}
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          className={`${button} sm:ml-auto`}
          onClick={onRefresh}
          disabled={disabled}
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          {t("content.refreshLibrary")}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{t("content.pageOrderHint")}</p>
    </nav>
  );
}
