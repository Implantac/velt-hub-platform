import { useTranslation } from "react-i18next";
import { healthHistory, diagnosticDate } from "../presentation";
import { healthMethod, scoreMethod, type DiagnosticData } from "@/lib/diagnostics/contracts";
import { readGaps } from "@/lib/json";
import { ScoreOverview } from "@/features/score/components/ScoreOverview";
import { ScoreGaps } from "@/features/score/components/ScoreGaps";
import { HealthCategoryCard } from "@/features/health/components/HealthCategoryCard";
import { DiagnosticMethod } from "./DiagnosticMethod";

export function DiagnosticResults({ data }: { data: DiagnosticData }) {
  const { t, i18n } = useTranslation();
  if (data.value === null || (Array.isArray(data.value) && data.value.length === 0))
    return (
      <section role="status" className="section-card space-y-3 p-6">
        <h2 className="text-lg font-semibold">{t(`diagnostics.${data.kind}.emptyTitle`)}</h2>
        <p className="text-sm text-muted-foreground">{t(`diagnostics.${data.kind}.emptyHint`)}</p>
      </section>
    );
  if (data.kind === "score" && data.value) {
    const score = data.value;
    const method = scoreMethod(score);
    return (
      <div className="min-w-0 space-y-5">
        <p className="text-sm text-muted-foreground">
          {t("diagnostics.savedAt")}{" "}
          <time dateTime={score.computed_at}>
            {diagnosticDate(score.computed_at, i18n.language)}
          </time>{" "}
          · {t("diagnostics.timeZone")}
        </p>
        {!method && (
          <p role="status" className="rounded-xl border border-border p-4 text-sm">
            {t("diagnostics.legacy")}
          </p>
        )}
        <ScoreOverview score={score} />
        <ScoreGaps gaps={readGaps(score.breakdown)} codes={method?.gapCodes} />
        {method && <DiagnosticMethod meta={method.diagnostic} />}
      </div>
    );
  }
  if (data.kind !== "health") return null;
  const history = healthHistory(data.value);
  return (
    <div className="min-w-0 space-y-5">
      {history.missing.length > 0 && (
        <p role="status" className="rounded-xl border border-border p-4 text-sm">
          {t("diagnostics.partial", {
            categories: history.missing
              .map((category) => t(`diagnostics.categories.${category}`))
              .join(", "),
          })}
        </p>
      )}
      {history.mixed && (
        <p role="status" className="rounded-xl border border-border p-4 text-sm">
          {t("diagnostics.mixed")}
        </p>
      )}
      {history.legacy && (
        <p role="status" className="rounded-xl border border-border p-4 text-sm">
          {t("diagnostics.legacy")}
        </p>
      )}
      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.value.map((row) => (
          <HealthCategoryCard key={row.id} h={row} />
        ))}
      </div>
      {history.commonMethod && <DiagnosticMethod meta={history.commonMethod} />}
      {!history.commonMethod && data.value.some((row) => healthMethod(row)) && (
        <p className="text-xs text-muted-foreground">{t("diagnostics.mixedMethod")}</p>
      )}
    </div>
  );
}
