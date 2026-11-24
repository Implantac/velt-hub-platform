import { useTranslation } from "react-i18next";
import { ScoreGauge } from "@/components/app/ScoreGauge";
import { scoreMethod, type ScoreRecord } from "@/lib/diagnostics/contracts";
import { PILLARS } from "../constants";

/** A confirmed record is required. Loading, absence and malformed pillars are not zeros. */
export function ScoreOverview({ score }: { score: ScoreRecord }) {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language);
  const meta = scoreMethod(score)?.diagnostic;
  const noQueueEvidence = meta && meta.jobEvidence.successes + meta.jobEvidence.failures === 0;
  return (
    <section
      aria-label={t("diagnostics.score.pillarsTitle")}
      className="grid min-w-0 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]"
    >
      <div className="section-card grid min-w-0 place-items-center p-4">
        <ScoreGauge value={score.overall} size={200} label={t("diagnostics.score.eyebrow")} />
      </div>
      <ul className="grid min-w-0 gap-3 sm:grid-cols-2">
        {PILLARS.map((key) => {
          const unavailable = key === "growth" && noQueueEvidence;
          return (
            <li key={key} className="stat-tile min-w-0">
              <div className="flex items-start justify-between gap-3 text-sm">
                <h2 className="min-w-0 font-medium">{t(`diagnostics.pillars.${key}`)}</h2>
                <span className="shrink-0 font-mono font-semibold tabular-nums">
                  {unavailable ? "—" : number.format(score[key])}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"
              >
                <div
                  className="h-full rounded-full bg-gradient-brand"
                  style={{ width: `${score[key]}%` }}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {t(
                  !meta
                    ? "diagnostics.legacyShort"
                    : unavailable
                      ? "diagnostics.noQueueEvidence"
                      : `diagnostics.pillarHints.${key}`,
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
