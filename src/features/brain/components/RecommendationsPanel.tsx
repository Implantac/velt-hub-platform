import { Check, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SectionCard } from "@/components/app/SectionCard";
import {
  effectiveBrainStatus,
  type BrainStatusChange,
  type NativeRecommendations,
} from "@/lib/brain/native";
import { brainDate, brainLanguage, brainReadState } from "../presentation";
import { ReadFeedback } from "./ReadFeedback";

type Props = {
  data: NativeRecommendations | undefined;
  isError: boolean;
  isFetching: boolean;
  canEdit: boolean;
  canWrite: boolean;
  onRetry: () => void;
  onSetStatus: (id: string, status: BrainStatusChange) => void;
};
export function RecommendationsPanel({
  data,
  isError,
  isFetching,
  canEdit,
  canWrite,
  onRetry,
  onSetStatus,
}: Props) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(brainLanguage(i18n.language));
  const priority = new Intl.NumberFormat(brainLanguage(i18n.language), {
    style: "percent",
    maximumFractionDigits: 0,
  });
  return (
    <SectionCard
      className="min-w-0 lg:col-span-3"
      icon={Sparkles}
      title={t("brainNative.recommendations")}
    >
      <ReadFeedback
        state={brainReadState({ data, isError })}
        label={t("brainNative.recommendations")}
        isFetching={isFetching}
        onRetry={onRetry}
      >
        {data && (
          <>
            <p className="text-xs text-muted-foreground">
              {t("brainNative.preview", {
                shown: number.format(data.items.length),
                total: number.format(data.total),
                limit: data.limit,
              })}
            </p>
            {data.items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                {t("brainNative.noRecommendations")}
              </p>
            ) : (
              <ul className="space-y-3">
                {data.items.map((rec) => {
                  const status = effectiveBrainStatus(rec, data.checkedAt);
                  return (
                    <li
                      key={rec.id}
                      className="min-w-0 space-y-3 rounded-xl border border-border/60 bg-background/30 p-4"
                    >
                      <h3 className="break-words font-semibold leading-snug">{rec.title}</h3>
                      {rec.rationale && (
                        <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                          {rec.rationale}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="rounded-md bg-secondary px-2 py-1">
                          {t(`brainNative.status.${status}`)}
                        </span>
                        <span className="py-1">
                          {t("brainNative.priority", { value: priority.format(rec.score) })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("brainNative.savedAt")}{" "}
                        <time dateTime={rec.created_at}>
                          {brainDate(rec.created_at, i18n.language)}
                        </time>
                      </p>
                      {rec.expires_at && (
                        <p className="text-xs text-muted-foreground">
                          {t("brainNative.expiresAt")}{" "}
                          <time dateTime={rec.expires_at}>
                            {brainDate(rec.expires_at, i18n.language)}
                          </time>
                        </p>
                      )}
                      {canEdit && status === "open" && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => onSetStatus(rec.id, "applied")}
                            disabled={!canWrite}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-50"
                            aria-label={t("brainNative.markAppliedNamed", { title: rec.title })}
                          >
                            <Check aria-hidden="true" className="size-4" />
                            {t("brainNative.markApplied")}
                          </button>
                          <button
                            type="button"
                            onClick={() => onSetStatus(rec.id, "dismissed")}
                            disabled={!canWrite}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium disabled:opacity-50"
                            aria-label={t("brainNative.dismissNamed", { title: rec.title })}
                          >
                            <X aria-hidden="true" className="size-4" />
                            {t("brainNative.dismiss")}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              {t("brainNative.checkedAt", { date: brainDate(data.checkedAt, i18n.language) })}
            </p>
          </>
        )}
      </ReadFeedback>
    </SectionCard>
  );
}
