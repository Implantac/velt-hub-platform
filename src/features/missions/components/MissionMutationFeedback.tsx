import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { MissionFeedback } from "../presentation";

type Props = {
  feedback: MissionFeedback | null;
  review: { refreshed: boolean } | null;
  confirmed: boolean;
  onConfirm: (confirmed: boolean) => void;
  onResume: () => void;
  onRefresh: () => void;
  disabled: boolean;
  canEdit: boolean;
};

export function MissionMutationFeedback({
  feedback,
  review,
  confirmed,
  onConfirm,
  onResume,
  onRefresh,
  disabled,
  canEdit,
}: Props) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <>
      {feedback && (
        <div
          role={
            feedback.kind === "unconfirmed" || feedback.kind === "refreshFailed"
              ? "alert"
              : "status"
          }
          className="space-y-2 rounded-xl border border-border p-4 text-sm"
        >
          <p>{t(`missionsNative.feedback.${feedback.kind}`)}</p>
          {feedback.eventMissing && <p>{t("missionsNative.eventMissing")}</p>}
          {feedback.readFailed && <p>{t("missionsNative.savedReadFailed")}</p>}
          {feedback.kind === "created" && (
            <p className="text-xs text-muted-foreground">{t("missionsNative.createdLocation")}</p>
          )}
        </div>
      )}
      {review && (
        <section
          aria-labelledby={`${id}-heading`}
          className="space-y-3 rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm"
        >
          <h2 id={`${id}-heading`} className="font-semibold">
            {t("missionsNative.reviewTitle")}
          </h2>
          <p>{t(review.refreshed ? "missionsNative.reviewReady" : "missionsNative.reviewHint")}</p>
          <button
            type="button"
            onClick={onRefresh}
            disabled={disabled}
            className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 font-medium disabled:opacity-50"
          >
            {t("missionsNative.reviewRefresh")}
          </button>
          {review.refreshed && canEdit && (
            <div className="space-y-3">
              <label className="flex min-h-11 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => onConfirm(event.target.checked)}
                  disabled={disabled}
                  className="mt-1 size-4 shrink-0 accent-primary"
                />
                <span>{t("missionsNative.reviewConfirm")}</span>
              </label>
              <button
                type="button"
                disabled={disabled || !confirmed}
                onClick={onResume}
                className="min-h-11 rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground disabled:opacity-50"
              >
                {t("missionsNative.reviewResume")}
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
