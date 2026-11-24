import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import type { MissionPage } from "@/lib/missions/contracts";
import { missionDate, missionLanguage, missionPageRange, missionReadState } from "../presentation";
import { MissionBoard } from "./MissionBoard";
import type { ComponentProps } from "react";

type Props = {
  data: MissionPage | undefined;
  requestedPage: number;
  isError: boolean;
  isFetching: boolean;
  busy: boolean;
  canEdit: boolean;
  canWrite: boolean;
  updatingId: string | null;
  onRetry: () => void;
  onPage: (page: number) => void;
  onMove: ComponentProps<typeof MissionBoard>["onMove"];
};

export function MissionResults(props: Props) {
  const { t, i18n } = useTranslation();
  const { data, isError, isFetching, busy, onRetry } = props;
  const state = missionReadState({ data, isError });
  const disabled = busy || isFetching;
  const retryButton = (
    <button
      type="button"
      onClick={onRetry}
      disabled={disabled}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
    >
      <RefreshCw aria-hidden="true" className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
      {t("missionsNative.retry")}
    </button>
  );
  if (state === "loading")
    return (
      <p role="status" className="rounded-xl border border-border p-5 text-sm">
        {t("missionsNative.loading")}
      </p>
    );
  if (state === "error" || !data)
    return (
      <section role="alert" className="space-y-3 rounded-xl border border-border p-5">
        <p className="text-sm">{t("missionsNative.readError")}</p>
        {retryButton}
        {props.requestedPage > 1 && (
          <button
            type="button"
            onClick={() => props.onPage(1)}
            disabled={disabled}
            className="ml-2 min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {t("missionsNative.firstPage")}
          </button>
        )}
      </section>
    );
  const range = missionPageRange(data);
  const nf = new Intl.NumberFormat(missionLanguage(i18n.language));
  return (
    <section
      aria-label={t("missionsNative.results")}
      className="min-w-0 space-y-4"
      aria-busy={isFetching}
    >
      {state === "stale" && (
        <div role="alert" className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-sm">{t("missionsNative.stale")}</p>
          {retryButton}
        </div>
      )}
      {isFetching && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("missionsNative.reading")}
        </p>
      )}
      <div className="space-y-1">
        <p role="status" className="text-sm font-medium">
          {t("missionsNative.range", {
            start: nf.format(range.start),
            end: nf.format(range.end),
            total: nf.format(data.total),
          })}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("missionsNative.checkedAt", {
            date: missionDate(data.checkedAt, i18n.language) ?? t("missionsNative.dateUnavailable"),
          })}
        </p>
        <p className="text-xs text-muted-foreground">{t("missionsNative.pageHint")}</p>
      </div>
      {range.outOfRange ? (
        <div role="status" className="space-y-3 rounded-xl border border-border p-5">
          <p className="text-sm">{t("missionsNative.pageOutOfRange")}</p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => props.onPage(1)}
            className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {t("missionsNative.firstPage")}
          </button>
        </div>
      ) : data.items.length === 0 ? (
        <div role="status" className="space-y-2 rounded-xl border border-dashed border-border p-6">
          <h2 className="font-semibold">
            {t(data.status === "all" ? "missionsNative.emptyTitle" : "missionsNative.emptyFilter")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              data.status === "all"
                ? props.canEdit
                  ? "missionsNative.emptyHint"
                  : "missionsNative.emptyViewerHint"
                : "missionsNative.emptyFilterHint",
            )}
          </p>
        </div>
      ) : (
        <MissionBoard
          missions={data.items}
          canEdit={props.canEdit}
          canWrite={props.canWrite && state === "ready" && !disabled}
          updatingId={props.updatingId}
          onMove={props.onMove}
        />
      )}
      <nav
        aria-label={t("missionsNative.pagination")}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <p className="text-sm text-muted-foreground">
          {t("missionsNative.pageNumber", {
            page: nf.format(data.page),
            pages: nf.format(range.pages),
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => props.onPage(data.page - 1)}
            disabled={disabled || !range.hasPrevious}
            className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {t("missionsNative.previous")}
          </button>
          <button
            type="button"
            onClick={() => props.onPage(data.page + 1)}
            disabled={disabled || !range.hasNext}
            className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {t("missionsNative.next")}
          </button>
        </div>
      </nav>
      {range.reachedPageLimit && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("missionsNative.pageLimit")}
        </p>
      )}
    </section>
  );
}
