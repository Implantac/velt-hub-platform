import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { skillDraftSchema, type SkillEditor } from "../presentation";

type Props = {
  headingAs?: "h2" | "h3";
  editor: SkillEditor;
  readReady: boolean;
  matches: boolean;
  busy: boolean;
  blocked: boolean;
  canReview: boolean;
  canSave: boolean;
  needsSave: boolean;
  acknowledged: boolean;
  onAcknowledge: (value: boolean) => void;
  onChange: (score: string, notes: string) => void;
  onStep: (step: "edit" | "review") => void;
  onSave: () => void;
  onCancel: () => void;
  onLoadLatest: () => void;
};
export function SkillAssessmentEditor({
  headingAs: Heading = "h2",
  editor,
  readReady,
  matches,
  busy,
  blocked,
  canReview,
  canSave,
  needsSave,
  acknowledged,
  onAcknowledge,
  onChange,
  onStep,
  onSave,
  onCancel,
  onLoadLatest,
}: Props) {
  const { t } = useTranslation(),
    id = useId(),
    heading = useRef<HTMLHeadingElement>(null),
    review = editor.step === "review";
  useEffect(() => {
    heading.current?.focus();
  }, [editor.area, editor.step]);
  const parsed = skillDraftSchema.safeParse({ score: editor.score, notes: editor.notes }),
    disabled = busy || blocked;
  return (
    <section
      className="min-w-0 space-y-4 rounded-xl border border-primary/60 p-4"
      aria-labelledby={`${id}-title`}
    >
      <Heading
        ref={heading}
        tabIndex={-1}
        id={`${id}-title`}
        className="rounded text-lg font-semibold focus:outline-2 focus:outline-offset-4 focus:outline-primary"
      >
        {t(review ? "skillMapNative.reviewTitle" : "skillMapNative.editTitle", {
          area: t(`skillMapNative.areas.${editor.area}.label`),
        })}
      </Heading>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t("skillMapNative.editorHint")}
      </p>
      {!readReady && (
        <p role="status" className="text-sm">
          {t("skillMapNative.reviewReadRequired")}
        </p>
      )}
      {readReady && !matches && (
        <div role="alert" className="space-y-3 rounded-lg border border-border p-3 text-sm">
          <p>{t("skillMapNative.baseChanged")}</p>
          <button
            type="button"
            onClick={onLoadLatest}
            disabled={disabled}
            className="min-h-11 rounded-lg border border-border px-3 py-2 font-semibold disabled:opacity-50"
          >
            {t("skillMapNative.loadLatest")}
          </button>
        </div>
      )}
      <form
        key={editor.step}
        data-skill-step={editor.step}
        onSubmit={(event) => {
          event.preventDefault();
          if (review) {
            if (canSave) onSave();
          } else if (canReview) onStep("review");
        }}
        className="min-w-0 space-y-4"
      >
        {!review ? (
          <>
            <label className="grid gap-2 text-sm font-semibold" htmlFor={`${id}-score`}>
              {t("skillMapNative.scoreLabel")}
            </label>
            <input
              id={`${id}-score`}
              type="number"
              min={0}
              max={100}
              step={1}
              required
              inputMode="numeric"
              value={editor.score}
              onChange={(event) => onChange(event.target.value, editor.notes)}
              disabled={disabled}
              aria-describedby={`${id}-score-help`}
              className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-base disabled:opacity-50"
            />
            <p id={`${id}-score-help`} className="text-xs leading-relaxed text-muted-foreground">
              {t("skillMapNative.scoreHelp")}
            </p>
            <label className="grid gap-2 text-sm font-semibold" htmlFor={`${id}-notes`}>
              {t("skillMapNative.notesLabel")}
            </label>
            <textarea
              id={`${id}-notes`}
              rows={4}
              maxLength={500}
              value={editor.notes}
              onChange={(event) => onChange(editor.score, event.target.value)}
              disabled={disabled}
              aria-describedby={`${id}-notes-help`}
              className="min-h-28 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
            />
            <p id={`${id}-notes-help`} className="text-xs leading-relaxed text-muted-foreground">
              {t("skillMapNative.notesHelp")}{" "}
              {t("skillMapNative.notesLength", { count: editor.notes.length })}
            </p>
            {!parsed.success && (editor.score !== "" || editor.notes.length > 500) && (
              <p role="status" className="text-sm">
                {t("skillMapNative.invalidDraft")}
              </p>
            )}
            <button
              type="submit"
              disabled={!canReview || disabled}
              className="min-h-11 w-full rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
            >
              {t("skillMapNative.review")}
            </button>
          </>
        ) : (
          <>
            <dl className="space-y-3 text-sm [overflow-wrap:anywhere]">
              <div>
                <dt className="font-semibold">{t("skillMapNative.beforeScore")}</dt>
                <dd>
                  {editor.expected ? editor.expected.score : t("skillMapNative.bands.unassessed")}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">{t("skillMapNative.afterScore")}</dt>
                <dd>{parsed.success ? parsed.data.score : editor.score}</dd>
              </div>
              <div>
                <dt className="font-semibold">{t("skillMapNative.notesLabel")}</dt>
                <dd className="whitespace-pre-wrap">
                  {editor.notes === "" ? t("skillMapNative.noNotes") : editor.notes}
                </dd>
              </div>
            </dl>
            <p className="text-sm leading-relaxed">{t("skillMapNative.replacementHint")}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t(
                editor.expected
                  ? "skillMapNative.preservedMetadataHint"
                  : "skillMapNative.newMetadataHint",
              )}
            </p>
            {editor.expected && editor.expected.source !== "self" && (
              <p className="text-sm [overflow-wrap:anywhere]">
                {t("skillMapNative.sourceChanges", {
                  source: JSON.stringify(editor.expected.source),
                })}
              </p>
            )}
            {!needsSave && (
              <p role="status" className="text-sm">
                {t("skillMapNative.noChange")}
              </p>
            )}
            <label className="flex min-h-11 items-start gap-3 rounded-lg border border-border p-3 text-sm leading-relaxed">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => onAcknowledge(event.target.checked)}
                disabled={disabled || !readReady || !matches || !needsSave}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              <span>{t("skillMapNative.consent")}</span>
            </label>
            <button
              type="submit"
              disabled={!canSave || disabled}
              className="min-h-11 w-full rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50"
            >
              {t(busy ? "skillMapNative.saving" : "skillMapNative.save")}
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                onStep("edit");
              }}
              disabled={disabled}
              className="min-h-11 w-full rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {t("skillMapNative.backToEdit")}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          className="min-h-11 w-full rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {t("skillMapNative.discard")}
        </button>
      </form>
    </section>
  );
}
