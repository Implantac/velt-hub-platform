import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Activity, Check, AlertTriangle } from "lucide-react";
import { healthMethod, type HealthRecord } from "@/lib/diagnostics/contracts";
import { diagnosticDate } from "@/features/diagnostics/presentation";
import { CAT_META } from "../constants";

export function HealthCategoryCard({ h }: { h: HealthRecord }) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const Icon = CAT_META[h.category] ?? Activity;
  const method = healthMethod(h);
  const noEvidence =
    h.category === "growth" &&
    method &&
    method.diagnostic.jobEvidence.successes + method.diagnostic.jobEvidence.failures === 0;
  const strengths = method
    ? method.strengthCodes.map((code) => t(`diagnostics.messages.${code}`))
    : h.strengths;
  const weaknesses = method
    ? method.weaknessCodes.map((code) => t(`diagnostics.messages.${code}`))
    : h.weaknesses;
  return (
    <article aria-labelledby={id} className="section-card min-w-0 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 id={id} className="flex min-w-0 items-start gap-2 text-sm font-semibold">
          <Icon aria-hidden="true" className="size-4 shrink-0 text-accent" />
          {t(`diagnostics.categories.${h.category}`)}
        </h2>
        <span className="shrink-0 text-2xl font-semibold tabular-nums">
          {noEvidence ? "—" : new Intl.NumberFormat(i18n.language).format(h.score)}
          <span className="sr-only">
            {noEvidence ? t("diagnostics.noQueueEvidence") : t("diagnostics.outOf100")}
          </span>
        </span>
      </div>
      <div aria-hidden="true" className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${h.score}%` }} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {t("diagnostics.savedAt")}{" "}
        <time dateTime={h.computed_at}>{diagnosticDate(h.computed_at, i18n.language)}</time> ·{" "}
        {t("diagnostics.timeZone")}
      </p>
      {!method && (
        <p className="mt-2 text-xs text-muted-foreground">{t("diagnostics.legacyShort")}</p>
      )}
      {strengths.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold">{t("diagnostics.strengths")}</h3>
          <ul className="mt-2 space-y-2">
            {strengths.map((text, index) => (
              <li key={index} className="flex items-start gap-2 text-xs leading-relaxed">
                <Check aria-hidden="true" className="mt-0.5 size-3 shrink-0 text-success" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {weaknesses.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold">{t("diagnostics.weaknesses")}</h3>
          <ul className="mt-2 space-y-2">
            {weaknesses.map((text, index) => (
              <li key={index} className="flex items-start gap-2 text-xs leading-relaxed">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-3 shrink-0 text-warning" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
