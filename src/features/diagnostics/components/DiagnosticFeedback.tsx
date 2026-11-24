import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { DiagnosticFeedback as Feedback } from "../presentation";

type Props = {
  feedback: Feedback | null;
  review: { refreshed: boolean } | null;
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
  onRefresh: () => void;
  onResume: () => void;
  busy: boolean;
  canEdit: boolean;
};
export function DiagnosticFeedback({
  feedback,
  review,
  confirmed,
  onConfirm,
  onRefresh,
  onResume,
  busy,
  canEdit,
}: Props) {
  const { t } = useTranslation();
  const id = useId();
  if (!feedback && !review) return null;
  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border p-4 text-sm">
      {feedback && (
        <div role={feedback.kind === "unconfirmed" ? "alert" : "status"} className="space-y-2">
          <p className="font-semibold">{t(`diagnostics.feedback.${feedback.kind}`)}</p>
          {feedback.snapshotMissing && <p>{t("diagnostics.snapshotMissing")}</p>}
          {feedback.answersStale && <p>{t("diagnostics.answersStale")}</p>}
          {feedback.readFailed && <p>{t("diagnostics.savedReadFailed")}</p>}
        </div>
      )}
      {review && canEdit && (
        <div className="space-y-3 border-t border-border pt-3">
          <h2 className="font-semibold">{t("diagnostics.reviewTitle")}</h2>
          <p className="text-muted-foreground">{t("diagnostics.reviewHint")}</p>
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            className="min-h-11 rounded-lg border border-border px-4 py-2 font-semibold disabled:opacity-50"
          >
            {t("diagnostics.reviewRefresh")}
          </button>
          {review.refreshed && (
            <>
              <label
                htmlFor={id}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg p-2"
              >
                <input
                  id={id}
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => onConfirm(event.target.checked)}
                  disabled={busy}
                  className="mt-1 size-5 shrink-0 accent-primary"
                />
                <span>{t("diagnostics.reviewConfirm")}</span>
              </label>
              <button
                type="button"
                onClick={onResume}
                disabled={busy || !confirmed}
                className="min-h-11 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
              >
                {t("diagnostics.reviewResume")}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
