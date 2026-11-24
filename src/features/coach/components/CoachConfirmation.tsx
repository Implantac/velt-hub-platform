import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { coachMethod } from "@/lib/coach/contracts";
import type { CoachProposal } from "../hooks/use-coach-workspace";

type Props = {
  proposal: CoachProposal;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  disabled: boolean;
};
export function CoachConfirmation({
  proposal,
  acknowledged,
  onAcknowledge,
  onConfirm,
  onCancel,
  disabled,
}: Props) {
  const { t } = useTranslation(),
    id = useId();
  const method = proposal.kind === "status" ? coachMethod(proposal.row) : null;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [proposal]);
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="min-w-0 space-y-3 rounded-xl border border-primary/50 bg-card p-4 text-sm [overflow-wrap:anywhere]"
    >
      <h2 ref={heading} tabIndex={-1} id={`${id}-title`} className="font-semibold">
        {t(
          proposal.kind === "generate"
            ? "coachNative.generateConfirmTitle"
            : `coachNative.statusConfirm.${proposal.action}`,
        )}
      </h2>
      {proposal.kind === "status" && (
        <p className="font-medium">
          {method ? t(`coachNative.rules.${method.coach.code}.title`) : proposal.row.title}
        </p>
      )}
      <p className="text-muted-foreground">
        {t(
          proposal.kind === "generate"
            ? "coachNative.generateConfirmHint"
            : "coachNative.statusConfirmHint",
        )}
      </p>
      <label
        htmlFor={id}
        className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg py-2"
      >
        <input
          id={id}
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => onAcknowledge(event.target.checked)}
          disabled={disabled}
          className="mt-1 size-5 shrink-0 accent-primary"
        />
        <span>{t("coachNative.confirmAcknowledge")}</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={disabled || !acknowledged}
          className="min-h-11 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {t("coachNative.confirm")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="min-h-11 rounded-lg border border-border px-4 py-2 font-semibold disabled:opacity-50"
        >
          {t("common.cancel")}
        </button>
      </div>
    </section>
  );
}
