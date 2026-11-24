import { useTranslation } from "react-i18next";
import { coachMethod, type CoachRecord } from "@/lib/coach/contracts";
import { coachDate, coachLanguage } from "../presentation";

export function CoachEvidence({ row }: { row: CoachRecord }) {
  const { t, i18n } = useTranslation();
  const method = coachMethod(row);
  if (!method)
    return (
      <p className="mt-3 rounded-lg border border-border p-3 text-xs text-muted-foreground">
        {t("coachNative.legacy")}
      </p>
    );
  const meta = method.coach.evidence;
  const number = new Intl.NumberFormat(coachLanguage(i18n.language));
  const sampled = Object.values(meta.sources).some((source) => source.loaded < source.total);
  return (
    <details className="mt-3 min-w-0 rounded-lg border border-border text-sm">
      <summary className="min-h-11 cursor-pointer px-3 py-3 font-semibold">
        {t("coachNative.methodSummary")}
      </summary>
      <div className="space-y-3 border-t border-border p-3 [overflow-wrap:anywhere]">
        <p className="font-medium">
          {method.coach.model} · {meta.model}
        </p>
        <p>{t(`coachNative.criteria.${method.coach.code}`)}</p>
        <p className="text-muted-foreground">
          {t(sampled ? "coachNative.sampled" : "coachNative.fullSlice")}
        </p>
        <dl className="grid gap-2 sm:grid-cols-2">
          {Object.entries(meta.sources).map(([name, source]) => (
            <div key={name}>
              <dt className="text-muted-foreground">{t(`diagnostics.sources.${name}`)}</dt>
              <dd className="font-semibold tabular-nums">
                {t("coachNative.coverage", {
                  loaded: number.format(source.loaded),
                  total: number.format(source.total),
                  limit: number.format(source.limit),
                })}
              </dd>
            </div>
          ))}
        </dl>
        <p>{t("coachNative.activity", { count: number.format(meta.recentCreated) })}</p>
        <p>
          {t("coachNative.queue", {
            successes: number.format(meta.jobEvidence.successes),
            failures: number.format(meta.jobEvidence.failures),
            excluded: number.format(meta.jobEvidence.excluded),
          })}
        </p>
        <p className="text-muted-foreground">
          {t("coachNative.window", {
            start: coachDate(meta.startedAt, i18n.language),
            end: coachDate(meta.finishedAt, i18n.language),
          })}
        </p>
        <p className="text-muted-foreground">{t("coachNative.evidenceHint")}</p>
        <p>
          {t("coachNative.batchReference")} <code className="text-xs">{meta.calculationId}</code>
        </p>
      </div>
    </details>
  );
}
