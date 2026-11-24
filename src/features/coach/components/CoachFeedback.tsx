import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { CoachOperationState } from "../operation-store";

type Props = {
  operation: CoachOperationState;
  canEdit: boolean;
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
  onRefresh: () => void;
  onResume: () => void;
  busy: boolean;
  readReady: boolean;
};
export function CoachFeedback({
  operation,
  canEdit,
  confirmed,
  onConfirm,
  onRefresh,
  onResume,
  busy,
  readReady,
}: Props) {
  const { t } = useTranslation(),
    id = useId(),
    { feedback, review, pending } = operation;
  if (!feedback && !review && !pending) return null;
  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border p-4 text-sm [overflow-wrap:anywhere]">
      {pending && <p role="status">{t(`coachNative.pending.${pending}`)}</p>}
      {feedback && (
        <div role={feedback.kind === "unconfirmed" ? "alert" : "status"} className="space-y-2">
          <p className="font-semibold">
            {t(`coachNative.feedback.${feedback.kind}`, { count: feedback.generated ?? 0 })}
          </p>
          {feedback.reference && (
            <p>
              {t("coachNative.operationReference")}{" "}
              <code className="text-xs">{feedback.reference}</code>
            </p>
          )}
          {feedback.eventMissing && <p>{t("coachNative.eventMissing")}</p>}
          {feedback.readFailed && <p>{t("coachNative.savedReadFailed")}</p>}
          {feedback.journeyReadFailed && <p>{t("coachNative.savedJourneyReadFailed")}</p>}
        </div>
      )}
      {review && canEdit && (
        <div className="space-y-3 border-t border-border pt-3">
          <h2 className="font-semibold">{t("coachNative.reviewTitle")}</h2>
          <p className="text-muted-foreground">{t("coachNative.reviewHint")}</p>
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            className="min-h-11 rounded-lg border border-border px-4 py-2 font-semibold disabled:opacity-50"
          >
            {t("coachNative.reviewRefresh")}
          </button>
          {review.refreshed && (
            <>
              <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
                <input
                  id={id}
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => onConfirm(event.target.checked)}
                  disabled={busy || !readReady}
                  className="mt-1 size-5 shrink-0 accent-primary"
                />
                <span>{t("coachNative.reviewConfirm")}</span>
              </label>
              <button
                type="button"
                onClick={onResume}
                disabled={busy || !readReady || !confirmed}
                className="min-h-11 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
              >
                {t("coachNative.reviewResume")}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
