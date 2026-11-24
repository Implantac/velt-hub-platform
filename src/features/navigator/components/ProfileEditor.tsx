import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { NavigatorForm } from "../constants";
import type { NavigatorAnswers } from "@/lib/navigator/contracts";
import { DiagnosticSteps } from "./DiagnosticSteps";

type Props = {
  form: NavigatorForm;
  reviewAnswers?: NavigatorAnswers;
  step: number;
  invalidFields: string[];
  disabled: boolean;
  confirmationDisabled: boolean;
  canSave: boolean;
  needsSave: boolean;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
  onChange: (form: NavigatorForm) => void;
  onStep: (step: number) => void;
  onSave: () => void;
  onCancel: () => void;
};
export function ProfileEditor({
  form,
  reviewAnswers,
  step,
  invalidFields,
  disabled,
  confirmationDisabled,
  canSave,
  needsSave,
  acknowledged,
  onAcknowledge,
  onChange,
  onStep,
  onSave,
  onCancel,
}: Props) {
  const { t } = useTranslation(),
    id = useId();
  return (
    <section
      aria-label={t("navigatorNative.editorTitle")}
      className="min-w-0 space-y-5 rounded-xl border border-border bg-card p-4 sm:p-6"
    >
      <p className="text-sm text-muted-foreground">{t("navigatorNative.draftHint")}</p>
      <ol
        aria-label={t("navigatorNative.progress")}
        className="grid grid-cols-3 gap-2 text-xs sm:grid-cols-6"
      >
        {[1, 2, 3, 4, 5, 6].map((value) => (
          <li
            key={value}
            aria-current={step === value ? "step" : undefined}
            className={`min-w-0 rounded-lg border p-2 [overflow-wrap:anywhere] ${step === value ? "border-primary font-semibold" : "border-border text-muted-foreground"}`}
          >
            {value}. {t(`navigatorNative.stepLabels.${value}`)}
          </li>
        ))}
      </ol>
      <DiagnosticSteps
        step={step}
        form={form}
        reviewAnswers={reviewAnswers}
        onChange={onChange}
        disabled={disabled}
        invalidFields={invalidFields}
      />
      {step === 6 && (
        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">{t("navigatorNative.saveEffects")}</p>
          <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
            <input
              id={id}
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => onAcknowledge(event.target.checked)}
              disabled={disabled || confirmationDisabled}
              className="mt-1 size-5 shrink-0 accent-primary"
            />
            <span className="text-sm">{t("navigatorNative.saveAcknowledge")}</span>
          </label>
          {!needsSave && invalidFields.length === 0 && (
            <p role="status" className="text-sm text-muted-foreground">
              {t("navigatorNative.noChanges")}
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => onStep(step - 1)}
          disabled={disabled || step === 1}
          className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {t("navigatorNative.previous")}
        </button>
        {step < 6 ? (
          <button
            type="button"
            onClick={() => onStep(step + 1)}
            disabled={
              disabled ||
              (step === 4 &&
                invalidFields.some(
                  (field) => field === "time_budget_hours_week" || field === "money_budget_monthly",
                ))
            }
            className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {t("navigatorNative.next")}
          </button>
        ) : (
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {t("navigatorNative.save")}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onCancel}
        disabled={disabled}
        className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {t("navigatorNative.cancel")}
      </button>
    </section>
  );
}
