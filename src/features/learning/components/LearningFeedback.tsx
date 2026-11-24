import { useTranslation } from "react-i18next";
import type { LearningReceipt } from "@/lib/learning/contracts";
import type { LearningOperation } from "../operation-store";
import { learningDate } from "../presentation";

export function LearningFeedback({
  operation,
  receipt,
  readReady,
  confirmed,
  onConfirm,
  onRead,
  onResume,
  busy,
}: {
  operation: LearningOperation;
  receipt: LearningReceipt | null;
  readReady: boolean;
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
  onRead: () => void;
  onResume: () => void;
  busy: boolean;
}) {
  const { t, i18n } = useTranslation();
  const feedback = operation.feedback;
  return (
    <>
      {operation.pending && (
        <p role="status" className="rounded-xl border border-border p-4 text-sm">
          {t("learningNative.saving")}
        </p>
      )}
      {feedback && (
        <div
          role={feedback.kind === "unconfirmed" ? "alert" : "status"}
          className="min-w-0 space-y-2 rounded-xl border border-border p-4 text-sm"
        >
          <p className="font-semibold">{t(`learningNative.feedback.${feedback.kind}`)}</p>
          <p className="text-xs [overflow-wrap:anywhere]">
            {t("learningNative.reference")} <code>{feedback.reference}</code>
          </p>
          {feedback.kind !== "unconfirmed" && feedback.readFailed && (
            <p>{t("learningNative.savedReadFailed")}</p>
          )}
          {receipt?.progress && feedback.kind !== "unconfirmed" && (
            <p>
              {t("learningNative.receiptPercent", { percent: receipt.progress.progress_pct })}{" "}
              <time dateTime={receipt.progress.updated_at}>
                {learningDate(receipt.progress.updated_at, i18n.language)}
              </time>
            </p>
          )}
        </div>
      )}
      {operation.review && (
        <section
          aria-label={t("learningNative.reviewTitle")}
          className="space-y-3 rounded-xl border-2 border-border p-4 text-sm"
        >
          <h2 className="font-semibold">{t("learningNative.reviewTitle")}</h2>
          <p>{t("learningNative.reviewHint")}</p>
          <button
            type="button"
            onClick={onRead}
            disabled={busy}
            className="min-h-11 rounded-lg border border-border px-4 py-2 disabled:opacity-50"
          >
            {t("learningNative.reviewRead")}
          </button>
          {operation.review.refreshed && readReady && !busy && (
            <label className="flex min-h-11 items-start gap-3 rounded-lg border border-border p-3">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-primary"
                checked={confirmed}
                onChange={(event) => onConfirm(event.target.checked)}
              />
              <span>{t("learningNative.reviewAcknowledge")}</span>
            </label>
          )}
          <button
            type="button"
            onClick={onResume}
            disabled={busy || !readReady || !operation.review.refreshed || !confirmed}
            className="min-h-11 rounded-lg border border-border px-4 py-2 disabled:opacity-50"
          >
            {t("learningNative.reviewResume")}
          </button>
        </section>
      )}
    </>
  );
}
