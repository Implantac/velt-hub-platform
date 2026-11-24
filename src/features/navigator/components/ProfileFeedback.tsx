import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { NavigatorOperation } from "../operation-store";

type Props = {
  operation: NavigatorOperation;
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
  onRefresh: () => void;
  onResume: () => void;
  busy: boolean;
  readReady: boolean;
};
export function ProfileFeedback({
  operation,
  confirmed,
  onConfirm,
  onRefresh,
  onResume,
  busy,
  readReady,
}: Props) {
  const { t } = useTranslation(),
    id = useId(),
    { pending, feedback, review } = operation;
  if (!pending && !feedback && !review) return null;
  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border p-4 text-sm [overflow-wrap:anywhere]">
      {pending && <p role="status">{t("navigatorNative.saving")}</p>}
      {feedback && (
        <div role={feedback.kind === "unconfirmed" ? "alert" : "status"} className="space-y-2">
          <p className="font-semibold">{t(`navigatorNative.feedback.${feedback.kind}`)}</p>
          {feedback.reference && (
            <p>
              {t("navigatorNative.revisionReference")}{" "}
              <code className="text-xs">{feedback.reference}</code>
            </p>
          )}
          {feedback.readFailed && <p>{t("navigatorNative.savedReadFailed")}</p>}
        </div>
      )}
      {review && (
        <div className="space-y-3 border-t border-border pt-3">
          <h2 className="font-semibold">{t("navigatorNative.reviewTitle")}</h2>
          <p className="text-muted-foreground">{t("navigatorNative.reviewHint")}</p>
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            className="min-h-11 rounded-lg border border-border px-4 py-2 font-semibold disabled:opacity-50"
          >
            {t("navigatorNative.reviewRefresh")}
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
                <span>{t("navigatorNative.reviewConfirm")}</span>
              </label>
              <button
                type="button"
                onClick={onResume}
                disabled={busy || !readReady || !confirmed}
                className="min-h-11 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
              >
                {t("navigatorNative.reviewResume")}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
