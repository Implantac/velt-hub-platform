import { useTranslation } from "react-i18next";
import type { DiagnosticMeta } from "@/lib/diagnostics/contracts";
import { diagnosticDate } from "../presentation";

export function DiagnosticMethod({ meta }: { meta: DiagnosticMeta }) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language);
  const sampled = Object.values(meta.sources).some((source) => source.loaded < source.total);
  return (
    <section
      aria-label={t("diagnostics.methodTitle")}
      className="min-w-0 space-y-3 rounded-xl border border-border bg-secondary/30 p-4 text-sm"
    >
      <h2 className="font-semibold">
        {t("diagnostics.methodTitle")} · {meta.model}
      </h2>
      <p>{t(sampled ? "diagnostics.sampled" : "diagnostics.fullSlice")}</p>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(meta.sources).map(([name, source]) => (
          <div key={name} className="min-w-0 rounded-lg border border-border p-3">
            <dt className="text-muted-foreground">{t(`diagnostics.sources.${name}`)}</dt>
            <dd className="mt-1 font-semibold tabular-nums">
              {t("diagnostics.coverage", {
                loaded: number.format(source.loaded),
                total: number.format(source.total),
              })}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground">
        {t("diagnostics.methodActivity", { count: number.format(meta.recentCreated) })}
      </p>
      <p className="text-muted-foreground">
        {t("diagnostics.methodQueue", {
          successes: number.format(meta.jobEvidence.successes),
          failures: number.format(meta.jobEvidence.failures),
          excluded: number.format(meta.jobEvidence.excluded),
        })}
      </p>
      {meta.jobEvidence.successes + meta.jobEvidence.failures === 0 && (
        <p>{t("diagnostics.noQueueEvidence")}</p>
      )}
      <p className="text-xs text-muted-foreground">
        {t("diagnostics.collectionWindow", {
          start: diagnosticDate(meta.startedAt, i18n.language),
          end: diagnosticDate(meta.finishedAt, i18n.language),
        })}
      </p>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          {t("diagnostics.formulaTitle")}
        </summary>
        <p className="mt-2 whitespace-pre-line leading-relaxed text-muted-foreground">
          {t("diagnostics.formula")}
        </p>
      </details>
    </section>
  );
}
