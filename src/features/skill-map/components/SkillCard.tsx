import { useTranslation } from "react-i18next";
import type { SkillArea, SkillAssessment } from "@/lib/skill-map/contracts";
import { skillBand, skillDate } from "../presentation";

export function SkillCard({
  area,
  row,
  disabled,
  onChoose,
  headingAs: Heading = "h2",
  idPrefix = "skill",
}: {
  headingAs?: "h2" | "h3";
  idPrefix?: "skill" | "brain-lab-skill";
  area: SkillArea;
  row: SkillAssessment | null;
  disabled: boolean;
  onChoose: (button: HTMLButtonElement) => void;
}) {
  const { t, i18n } = useTranslation(),
    band = skillBand(row?.score ?? null);
  return (
    <section
      className="min-w-0 space-y-3 rounded-xl border border-border bg-card/60 p-4"
      aria-labelledby={`${idPrefix}-${area}-title`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading id={`${idPrefix}-${area}-title`} className="text-base font-semibold">
            {t(`skillMapNative.areas.${area}.label`)}
          </Heading>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t(`skillMapNative.areas.${area}.hint`)}
          </p>
        </div>
        <span
          className="shrink-0 font-mono text-2xl tabular-nums"
          aria-label={
            row
              ? t("skillMapNative.declaredScore", { score: row.score })
              : t("skillMapNative.bands.unassessed")
          }
        >
          {row?.score ?? "—"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{t(`skillMapNative.bands.${band}`)}</p>
      {row ? (
        <>
          <p className="text-xs text-muted-foreground">
            {t("skillMapNative.assessedAt")}{" "}
            <time dateTime={row.assessed_at}>{skillDate(row.assessed_at, i18n.language)}</time>
          </p>
          <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
            {row.notes === null
              ? t("skillMapNative.noNotes")
              : row.notes === ""
                ? t("skillMapNative.originalEmptyNotes")
                : row.notes}
          </p>
          <details className="min-w-0 text-xs text-muted-foreground">
            <summary className="min-h-11 cursor-pointer py-3 font-semibold">
              {t("skillMapNative.originalDetails")}
            </summary>
            <dl className="space-y-2 [overflow-wrap:anywhere]">
              <div>
                <dt className="font-semibold">{t("skillMapNative.source")}</dt>
                <dd>{JSON.stringify(row.source)}</dd>
              </div>
              <div>
                <dt className="font-semibold">{t("skillMapNative.confidence")}</dt>
                <dd>{row.confidence}</dd>
              </div>
            </dl>
            <p className="mt-3 leading-relaxed">{t("skillMapNative.technicalHint")}</p>
            <p className="mt-3 font-semibold">{t("skillMapNative.evidence")}</p>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-xs [overflow-wrap:anywhere]">
              {JSON.stringify(row.evidence, null, 2)}
            </pre>
          </details>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("skillMapNative.noAssessment")}</p>
      )}
      <button
        type="button"
        onClick={(event) => onChoose(event.currentTarget)}
        disabled={disabled}
        aria-label={t("skillMapNative.chooseArea", {
          area: t(`skillMapNative.areas.${area}.label`),
        })}
        className="min-h-11 w-full rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {t(row ? "skillMapNative.edit" : "skillMapNative.start")}
      </button>
    </section>
  );
}
