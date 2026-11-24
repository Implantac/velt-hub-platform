import { useTranslation } from "react-i18next";
import type { LearningPage } from "@/lib/learning/contracts";
import { learningLastPage } from "../presentation";

export function LearningPagination({
  data,
  disabled,
  onPage,
}: {
  data: LearningPage;
  disabled: boolean;
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation(),
    last = learningLastPage(data);
  const buttonClass =
    "min-h-11 rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50";
  return (
    <nav aria-label={t("learningNative.pagination")} className="flex flex-wrap items-center gap-3">
      <p className="w-full text-sm">
        {t("learningNative.pageCount", { page: data.page, pages: last, total: data.total })}
      </p>
      <button
        type="button"
        className={buttonClass}
        disabled={disabled || data.page <= 1 || data.page - 1 > last}
        onClick={() => onPage(data.page - 1)}
      >
        {t("learningNative.previous")}
      </button>
      <button
        type="button"
        className={buttonClass}
        disabled={disabled || data.page >= last}
        onClick={() => onPage(data.page + 1)}
      >
        {t("learningNative.next")}
      </button>
      {data.page > last && (
        <button type="button" className={buttonClass} disabled={disabled} onClick={() => onPage(1)}>
          {t("learningNative.firstPage")}
        </button>
      )}
    </nav>
  );
}
