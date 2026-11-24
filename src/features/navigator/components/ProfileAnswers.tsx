import { useTranslation } from "react-i18next";
import type { NavigatorAnswers } from "@/lib/navigator/contracts";
import { NAVIGATOR_CHANNELS, NAVIGATOR_CONTENT, NAVIGATOR_GOALS } from "@/lib/navigator/options";
import type { NavigatorDraft } from "../presentation";
import { Stat } from "./atoms";

export function ProfileAnswers({ answers }: { answers: NavigatorAnswers | NavigatorDraft }) {
  const { t, i18n } = useTranslation();
  const list = (
    values: string[],
    options: readonly { id: string; value: string }[],
    group: string,
  ) =>
    values.length
      ? values
          .map((value) => {
            const known = options.find((option) => option.value === value);
            return known
              ? t(`navigatorNative.${group}.${known.id}`)
              : `${value} (${t("navigatorNative.originalChoice")})`;
          })
          .join(" · ")
      : t("navigatorNative.notSelected");
  const number = new Intl.NumberFormat(i18n.language.startsWith("en") ? "en-US" : "pt-BR");
  const money =
    typeof answers.money_budget_monthly === "number"
      ? new Intl.NumberFormat(i18n.language.startsWith("en") ? "en-US" : "pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(answers.money_budget_monthly)
      : answers.money_budget_monthly || t("navigatorNative.invalidValue");
  return (
    <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
      <Stat label={t("navigatorNative.fields.experience_level")}>
        {t(`navigatorNative.experience.${answers.experience_level}`)}
      </Stat>
      <Stat label={t("navigatorNative.fields.business_path")}>
        {answers.business_path
          ? t(`navigatorNative.paths.${answers.business_path}.label`)
          : t("navigatorNative.unspecified")}
      </Stat>
      <Stat label={t("navigatorNative.fields.goals")}>
        {list(answers.goals, NAVIGATOR_GOALS, "goals")}
      </Stat>
      <Stat label={t("navigatorNative.fields.time_budget_hours_week")}>
        {typeof answers.time_budget_hours_week === "number"
          ? number.format(answers.time_budget_hours_week)
          : answers.time_budget_hours_week || t("navigatorNative.invalidValue")}
      </Stat>
      <Stat label={t("navigatorNative.fields.money_budget_monthly")}>{money}</Stat>
      <Stat label={t("navigatorNative.fields.preferred_channels")}>
        {list(answers.preferred_channels, NAVIGATOR_CHANNELS, "channels")}
      </Stat>
      <Stat label={t("navigatorNative.fields.content_preferences")}>
        {list(answers.content_preferences, NAVIGATOR_CONTENT, "formats")}
      </Stat>
    </dl>
  );
}
