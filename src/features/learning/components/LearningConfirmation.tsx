import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { learningCounts } from "@/lib/learning/contracts";
import type { LearningIntent } from "../presentation";

export function LearningConfirmation({
  intent,
  matches,
  readReady,
  pending,
  blocked,
  acknowledged,
  canSave,
  onAcknowledge,
  onSave,
  onCancel,
}: {
  intent: LearningIntent;
  matches: boolean;
  readReady: boolean;
  pending: boolean;
  blocked: boolean;
  acknowledged: boolean;
  canSave: boolean;
  onAcknowledge: (value: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(),
    id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [intent.pathId, intent.milestoneId]);
  const path = intent.observedPath;
  const previous = intent.expectedProgress?.completed_milestones ?? [];
  const next = intent.completed
    ? [...previous, intent.milestoneId]
    : previous.filter((value) => value !== intent.milestoneId);
  const counts = learningCounts(path, { completed_milestones: next });
  return (
    <section
      aria-labelledby={id}
      className="min-w-0 space-y-4 rounded-xl border-2 border-primary p-4 sm:p-5"
    >
      <h2 ref={heading} tabIndex={-1} id={id} className="text-lg font-semibold">
        {t("learningNative.confirmTitle")}
      </h2>
      <p className="text-sm font-medium [overflow-wrap:anywhere]">
        {path.title} —{" "}
        {path.milestones.find((item) => item.id === intent.milestoneId)?.title ??
          intent.milestoneId}
      </p>
      <p className="text-sm">
        {t(intent.completed ? "learningNative.confirmAdd" : "learningNative.confirmRemove")}
      </p>
      <p className="text-sm">
        {t("learningNative.preview", {
          done: counts.known,
          total: counts.total,
          percent: counts.percent,
        })}
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">{t("learningNative.effects")}</p>
      {counts.unknown.length > 0 && (
        <p className="text-xs">
          {t("learningNative.preserveUnknown", { count: counts.unknown.length })}
        </p>
      )}
      {!matches && readReady && (
        <p role="alert" className="text-sm font-medium">
          {t("learningNative.changedBase")}
        </p>
      )}
      {!readReady && (
        <p role="status" className="text-sm">
          {t("learningNative.confirmReadRequired")}
        </p>
      )}
      <label className="flex min-h-11 items-start gap-3 rounded-lg border border-border p-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 size-4 shrink-0 accent-primary"
          checked={acknowledged}
          disabled={pending || blocked || !matches || !readReady}
          onChange={(event) => onAcknowledge(event.target.checked)}
        />
        <span>{t("learningNative.saveAcknowledge")}</span>
      </label>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {t("learningNative.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending || blocked}
          className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50"
        >
          {t("learningNative.cancel")}
        </button>
      </div>
    </section>
  );
}
