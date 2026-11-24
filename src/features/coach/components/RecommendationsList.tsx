import { Link } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { coachAction, coachMethod, coachState, type CoachRecord } from "@/lib/coach/contracts";
import { KIND_META } from "../constants";
import { coachDate } from "../presentation";
import { CoachEvidence } from "./CoachEvidence";

type Props = {
  recs: CoachRecord[];
  canEdit: boolean;
  canWrite: boolean;
  onPrepare: (row: CoachRecord, action: "complete" | "dismiss") => void;
};
export function RecommendationsList({ recs, canEdit, canWrite, onPrepare }: Props) {
  const { t, i18n } = useTranslation();
  return (
    <div className="min-w-0 space-y-3">
      {recs.map((row) => {
        const meta = KIND_META[row.kind],
          Icon = meta.icon;
        const method = coachMethod(row),
          action = coachAction(row),
          status = coachState(row);
        const title = method ? t(`coachNative.rules.${method.coach.code}.title`) : row.title;
        const body = method ? t(`coachNative.rules.${method.coach.code}.body`) : row.body;
        return (
          <article
            key={row.id}
            aria-labelledby={`coach-${row.id}`}
            className="min-w-0 rounded-xl border border-border bg-card p-4 [overflow-wrap:anywhere] sm:p-5"
          >
            <div className="flex min-w-0 items-start gap-3">
              <div
                className={`grid size-10 shrink-0 place-items-center rounded-xl bg-secondary ${meta.color}`}
              >
                <Icon aria-hidden="true" className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span>{t(`coachNative.kinds.${row.kind}`)}</span>
                  <span className="rounded-full bg-secondary px-2 py-1">
                    {t(`coachNative.severities.${row.severity}`)}
                  </span>
                  <span className="rounded-full border border-border px-2 py-1">
                    {t(`coachNative.states.${status}`)}
                  </span>
                </div>
                <h3 id={`coach-${row.id}`} className="mt-2 font-semibold">
                  {title}
                </h3>
                {body && (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                )}
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {t("coachNative.created")}{" "}
              <time dateTime={row.created_at}>{coachDate(row.created_at, i18n.language)}</time>
            </p>
            {row.completed_at && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("coachNative.completed")}{" "}
                <time dateTime={row.completed_at}>
                  {coachDate(row.completed_at, i18n.language)}
                </time>
              </p>
            )}
            {row.dismissed_at && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("coachNative.dismissed")}{" "}
                <time dateTime={row.dismissed_at}>
                  {coachDate(row.dismissed_at, i18n.language)}
                </time>
              </p>
            )}
            {status === "conflicted" && (
              <p className="mt-3 rounded-lg border border-border p-3 text-sm">
                {t("coachNative.conflictedHint")}
              </p>
            )}
            <CoachEvidence row={row} />
            <div className="mt-3 flex flex-wrap gap-2">
              {action && (
                <Link
                  to={action.href}
                  className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 py-2 text-sm font-semibold"
                >
                  {method
                    ? t(`coachNative.rules.${method.coach.code}.action`)
                    : action.label || t("coachNative.openDestination")}{" "}
                  →
                </Link>
              )}
              {canEdit && status === "open" && (
                <>
                  <button
                    type="button"
                    onClick={() => onPrepare(row, "complete")}
                    disabled={!canWrite}
                    aria-label={t("coachNative.completeLabel", { title })}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    <Check aria-hidden="true" className="size-4" />
                    {t("coachNative.complete")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onPrepare(row, "dismiss")}
                    disabled={!canWrite}
                    aria-label={t("coachNative.dismissLabel", { title })}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    <X aria-hidden="true" className="size-4" />
                    {t("coachNative.dismiss")}
                  </button>
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
