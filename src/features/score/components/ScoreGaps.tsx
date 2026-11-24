import { useTranslation } from "react-i18next";
import type { DiagnosticMessage } from "@/lib/diagnostics/contracts";

export function ScoreGaps({ gaps, codes }: { gaps: string[]; codes?: DiagnosticMessage[] }) {
  const { t, i18n } = useTranslation();
  const items = codes ? codes.map((code) => t(`diagnostics.messages.${code}`)) : gaps;
  return (
    <section aria-label={t("diagnostics.score.gapsTitle")} className="section-card min-w-0 p-5">
      <h2 className="mb-3 text-base font-semibold">{t("diagnostics.score.gapsTitle")}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("diagnostics.score.noGaps")}</p>
      ) : (
        <ol className="space-y-2">
          {items.map((gap, index) => (
            <li
              key={index}
              className="flex min-w-0 items-start gap-3 rounded-lg border border-border/70 p-3 text-sm leading-relaxed"
            >
              <span
                aria-hidden="true"
                className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary"
              >
                {new Intl.NumberFormat(i18n.language).format(index + 1)}
              </span>
              <span className="min-w-0 [overflow-wrap:anywhere]">{gap}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
