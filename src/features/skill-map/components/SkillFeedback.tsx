import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { SkillReceipt } from "@/lib/skill-map/contracts";
import type { SkillOperation } from "../operation-store";
import { skillDate } from "../presentation";

export function SkillFeedback({
  headingAs: Heading = "h2",
  operation,
  receipt,
  readReady,
  confirmed,
  busy,
  onConfirm,
  onRead,
  onResume,
}: {
  headingAs?: "h2" | "h3";
  operation: SkillOperation;
  receipt: SkillReceipt | null;
  readReady: boolean;
  confirmed: boolean;
  busy: boolean;
  onConfirm: (value: boolean) => void;
  onRead: () => void;
  onResume: () => void;
}) {
  const { t, i18n } = useTranslation(),
    title = useRef<HTMLHeadingElement>(null),
    feedback = operation.feedback;
  useEffect(() => {
    if (feedback) title.current?.focus();
  }, [feedback]);
  if (operation.pending)
    return (
      <p role="status" className="rounded-xl border border-border p-4 text-sm">
        {t("skillMapNative.savingHint")}
      </p>
    );
  if (!feedback) return null;
  return (
    <section
      className="min-w-0 space-y-3 rounded-xl border border-border p-4"
      role={feedback.kind === "unconfirmed" ? "alert" : "status"}
    >
      <Heading
        ref={title}
        tabIndex={-1}
        className="rounded text-base font-semibold focus:outline-2 focus:outline-offset-4 focus:outline-primary"
      >
        {t(`skillMapNative.feedback.${feedback.kind}`)}
      </Heading>
      <p className="text-sm leading-relaxed">
        {t(
          feedback.kind === "unconfirmed"
            ? "skillMapNative.uncertainHint"
            : "skillMapNative.savedHint",
        )}
      </p>
      {receipt && (
        <p className="text-sm">
          {t("skillMapNative.receiptSummary", {
            area: t(`skillMapNative.areas.${receipt.area}.label`),
            score: receipt.assessment.score,
            date: skillDate(receipt.assessment.assessed_at, i18n.language),
          })}
        </p>
      )}
      <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
        {t("skillMapNative.reference")} <code>{feedback.reference}</code>
      </p>
      {feedback.kind !== "unconfirmed" && feedback.readFailed && (
        <p className="text-sm">{t("skillMapNative.savedReadWarning")}</p>
      )}
      {operation.review && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={onRead}
            disabled={busy}
            className="min-h-11 w-full rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {t("skillMapNative.refresh")}
          </button>
          <label className="flex min-h-11 items-start gap-3 rounded-lg border border-border p-3 text-sm leading-relaxed">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => onConfirm(event.target.checked)}
              disabled={busy || !readReady || !operation.review.refreshed}
              className="mt-1 size-4 shrink-0 accent-primary"
            />
            <span>{t("skillMapNative.recoveryConsent")}</span>
          </label>
          <button
            type="button"
            onClick={onResume}
            disabled={busy || !confirmed || !readReady || !operation.review.refreshed}
            className="min-h-11 w-full rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {t("skillMapNative.resume")}
          </button>
        </div>
      )}
    </section>
  );
}
