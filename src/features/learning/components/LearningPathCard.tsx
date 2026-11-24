import { Check, Circle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { learningCounts, type LearningPath, type LearningProgress } from "@/lib/learning/contracts";
import { learningDate } from "../presentation";

export function LearningPathCard({
  path,
  progress,
  disabled,
  onChoose,
}: {
  path: LearningPath;
  progress: LearningProgress | null | undefined;
  disabled: boolean;
  onChoose: (milestoneId: string, origin: HTMLButtonElement) => void;
}) {
  const { t, i18n } = useTranslation();
  const counts = progress === undefined ? null : learningCounts(path, progress);
  const titleId = `learning-path-${path.id}`;
  return (
    <section
      aria-labelledby={titleId}
      className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={titleId} className="min-w-0 flex-1 text-lg font-semibold [overflow-wrap:anywhere]">
          {path.title}
        </h2>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs">
          {t(`learningNative.difficulty.${path.difficulty}`)}
        </span>
      </div>
      {path.description && (
        <p className="text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
          {path.description}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {t("learningNative.hours", { hours: path.estimated_hours })}
      </p>
      {counts ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {t("learningNative.counts", {
              done: counts.known,
              total: counts.total,
              percent: counts.percent,
            })}
          </p>
          <progress
            className="h-2 w-full accent-primary"
            max={100}
            value={counts.percent}
            aria-label={`${t("learningNative.progressLabel")}: ${path.title}`}
          />
          {progress === null && (
            <p className="text-xs text-muted-foreground">{t("learningNative.noProgress")}</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("learningNative.progressUnconfirmed")}</p>
      )}
      {progress && counts && (
        <details className="rounded-lg border border-border p-3 text-xs">
          <summary className="min-h-11 cursor-pointer content-center font-medium">
            {t("learningNative.recordDetails")}
          </summary>
          <div className="mt-2 space-y-2 [overflow-wrap:anywhere]">
            <p>{t("learningNative.storedPercent", { percent: progress.progress_pct })}</p>
            {progress.progress_pct !== counts.percent && (
              <p role="note">{t("learningNative.legacyPercent")}</p>
            )}
            {progress.completed_at && (counts.total === 0 || counts.known !== counts.total) && (
              <p role="note">{t("learningNative.legacyCompletion")}</p>
            )}
            <p>
              {t("learningNative.started")}{" "}
              <time dateTime={progress.started_at}>
                {learningDate(progress.started_at, i18n.language)}
              </time>
            </p>
            <p>
              {t("learningNative.updated")}{" "}
              <time dateTime={progress.updated_at}>
                {learningDate(progress.updated_at, i18n.language)}
              </time>
            </p>
            {progress.completed_at && (
              <p>
                {t("learningNative.completedDate")}{" "}
                <time dateTime={progress.completed_at}>
                  {learningDate(progress.completed_at, i18n.language)}
                </time>
              </p>
            )}
            {counts.unknown.length > 0 && (
              <div>
                <p>{t("learningNative.unknownIds", { count: counts.unknown.length })}</p>
                <ul className="mt-2 list-inside list-disc space-y-1">
                  {counts.unknown.map((id) => (
                    <li key={id}>
                      <code className="[overflow-wrap:anywhere]">{JSON.stringify(id)}</code>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}
      {path.milestones.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("learningNative.noMilestones")}</p>
      ) : (
        <ul className="space-y-2">
          {path.milestones.map((milestone) => {
            const done = progress?.completed_milestones.includes(milestone.id) ?? false;
            const Icon = done ? Check : Circle;
            return (
              <li key={milestone.id}>
                <button
                  type="button"
                  aria-pressed={done}
                  disabled={disabled || progress === undefined}
                  onClick={(event) => onChoose(milestone.id, event.currentTarget)}
                  className="flex min-h-11 w-full items-start gap-3 rounded-lg border border-border p-3 text-left text-sm hover:bg-secondary disabled:opacity-50"
                >
                  <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {milestone.title}
                    <span className="sr-only">
                      {" "}
                      — {t(done ? "learningNative.removeMark" : "learningNative.addMark")}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
