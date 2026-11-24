import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { NAVIGATOR_EXPERIENCE } from "@/lib/navigator/options";
import type { NavigatorAnswers } from "@/lib/navigator/contracts";
import { BUSINESS_PATHS, CHANNELS, CONTENT_TYPES, GOALS, type NavigatorForm } from "../constants";
import { ChoiceCard, Chip } from "./atoms";
import { ProfileAnswers } from "./ProfileAnswers";

type Props = {
  step: number;
  form: NavigatorForm;
  reviewAnswers?: NavigatorAnswers;
  onChange: (form: NavigatorForm) => void;
  disabled: boolean;
  invalidFields: string[];
};
export function DiagnosticSteps({
  step,
  form,
  reviewAnswers,
  onChange,
  disabled,
  invalidFields,
}: Props) {
  const { t } = useTranslation(),
    id = useId(),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  const toggle = (key: "goals" | "preferred_channels" | "content_preferences", value: string) =>
    onChange({
      ...form,
      [key]: form[key].includes(value)
        ? form[key].filter((item) => item !== value)
        : [...form[key], value],
    });
  const collection = (
    key: "goals" | "preferred_channels" | "content_preferences",
    options: readonly { id: string; value: string }[],
    group: string,
  ) => {
    const custom = [
      ...new Set(form[key].filter((value) => !options.some((option) => option.value === value))),
    ];
    return (
      <fieldset disabled={disabled} className="min-w-0 space-y-3">
        <legend className="mb-3 text-sm font-semibold">{t(`navigatorNative.fields.${key}`)}</legend>
        <p className="text-xs text-muted-foreground">{t("navigatorNative.multipleOptional")}</p>
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          {options.map((option) => (
            <Chip
              key={option.id}
              active={form[key].includes(option.value)}
              onChange={() => toggle(key, option.value)}
              disabled={disabled}
            >
              {t(`navigatorNative.${group}.${option.id}`)}
            </Chip>
          ))}
          {custom.map((value) => (
            <Chip key={value} active={true} onChange={() => toggle(key, value)} disabled={disabled}>
              {value} · {t("navigatorNative.originalChoice")}
            </Chip>
          ))}
        </div>
        {invalidFields.includes(key) && (
          <p role="alert" className="text-sm">
            {t(`navigatorNative.validation.${key}`)}
          </p>
        )}
      </fieldset>
    );
  };
  return (
    <div className="min-w-0 space-y-5">
      <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold">
        {t(`navigatorNative.steps.${step}`)}
      </h2>
      {step === 1 && (
        <fieldset disabled={disabled} className="space-y-3">
          <legend className="mb-3 text-sm text-muted-foreground">
            {t("navigatorNative.experienceHint")}
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {NAVIGATOR_EXPERIENCE.map((value) => (
              <ChoiceCard
                key={value}
                name={`${id}-experience`}
                value={value}
                active={form.experience_level === value}
                onChange={() => onChange({ ...form, experience_level: value })}
                label={t(`navigatorNative.experience.${value}`)}
                disabled={disabled}
              />
            ))}
          </div>
        </fieldset>
      )}
      {step === 2 && (
        <fieldset disabled={disabled} className="space-y-3">
          <legend className="mb-3 text-sm text-muted-foreground">
            {t("navigatorNative.pathHint")}
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              name={`${id}-path`}
              value="unspecified"
              active={form.business_path === null}
              onChange={() => onChange({ ...form, business_path: null })}
              label={t("navigatorNative.unspecified")}
              disabled={disabled}
            />
            {BUSINESS_PATHS.map((value) => (
              <ChoiceCard
                key={value}
                name={`${id}-path`}
                value={value}
                active={form.business_path === value}
                onChange={() => onChange({ ...form, business_path: value })}
                label={t(`navigatorNative.paths.${value}.label`)}
                desc={t(`navigatorNative.paths.${value}.description`)}
                disabled={disabled}
              />
            ))}
          </div>
        </fieldset>
      )}
      {step === 3 && collection("goals", GOALS, "goals")}
      {step === 4 && (
        <fieldset disabled={disabled} className="space-y-5">
          <legend className="mb-3 text-sm text-muted-foreground">
            {t("navigatorNative.budgetHint")}
          </legend>
          <div className="space-y-2">
            <label htmlFor={`${id}-hours`} className="block text-sm font-semibold">
              {t("navigatorNative.fields.time_budget_hours_week")}
            </label>
            <input
              id={`${id}-hours`}
              type="text"
              inputMode="numeric"
              value={form.time_budget_hours_week}
              onChange={(event) =>
                onChange({ ...form, time_budget_hours_week: event.target.value })
              }
              aria-invalid={invalidFields.includes("time_budget_hours_week")}
              aria-describedby={`${id}-hours-hint`}
              className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2"
            />
            <p id={`${id}-hours-hint`} className="text-xs text-muted-foreground">
              {t("navigatorNative.validation.time_budget_hours_week")}
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor={`${id}-money`} className="block text-sm font-semibold">
              {t("navigatorNative.fields.money_budget_monthly")}
            </label>
            <input
              id={`${id}-money`}
              type="text"
              inputMode="decimal"
              value={form.money_budget_monthly}
              onChange={(event) => onChange({ ...form, money_budget_monthly: event.target.value })}
              aria-invalid={invalidFields.includes("money_budget_monthly")}
              aria-describedby={`${id}-money-hint`}
              className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2"
            />
            <p id={`${id}-money-hint`} className="text-xs text-muted-foreground">
              {t("navigatorNative.validation.money_budget_monthly")}
            </p>
          </div>
        </fieldset>
      )}
      {step === 5 && (
        <div className="space-y-6">
          {collection("preferred_channels", CHANNELS, "channels")}
          <p className="text-sm text-muted-foreground">{t("navigatorNative.channelHint")}</p>
          {collection("content_preferences", CONTENT_TYPES, "formats")}
        </div>
      )}
      {step === 6 && (
        <>
          <p className="text-sm text-muted-foreground">{t("navigatorNative.reviewAnswersHint")}</p>
          {reviewAnswers &&
            (JSON.stringify(form.goals) !== JSON.stringify(reviewAnswers.goals) ||
              JSON.stringify(form.preferred_channels) !==
                JSON.stringify(reviewAnswers.preferred_channels) ||
              JSON.stringify(form.content_preferences) !==
                JSON.stringify(reviewAnswers.content_preferences)) && (
              <p className="rounded-lg border border-border p-3 text-sm">
                {t("navigatorNative.normalizationHint")}
              </p>
            )}
          <ProfileAnswers answers={reviewAnswers ?? form} />
          {invalidFields.length > 0 && (
            <p role="alert" className="text-sm">
              {t("navigatorNative.validation.summary")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
