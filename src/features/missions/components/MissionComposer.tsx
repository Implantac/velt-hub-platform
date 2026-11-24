import { useId } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { missionDraftSchema, type MissionDraft } from "@/lib/missions/contracts";

type Props = {
  draft: MissionDraft;
  onChange: (draft: MissionDraft) => void;
  onSubmit: () => void;
  canWrite: boolean;
  busy: boolean;
  isSaving: boolean;
};

export function MissionComposer({ draft, onChange, onSubmit, canWrite, busy, isSaving }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const valid = missionDraftSchema.safeParse(draft).success;
  const titleInvalid =
    draft.title.length > 0 && (draft.title.trim().length < 2 || draft.title.trim().length > 160);
  return (
    <section aria-labelledby={`${id}-heading`} className="section-card space-y-4 p-4 sm:p-5">
      <div>
        <h2 id={`${id}-heading`} className="font-semibold">
          {t("missionsNative.createTitle")}
        </h2>
        <p id={`${id}-hint`} className="mt-1 text-sm text-muted-foreground">
          {t("missionsNative.createHint")}
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canWrite && !busy && valid) onSubmit();
        }}
        className="space-y-4"
        aria-describedby={`${id}-hint`}
        aria-busy={isSaving}
      >
        <div className="space-y-1.5">
          <label htmlFor={`${id}-title`} className="text-sm font-medium">
            {t("missionsNative.titleLabel")}
          </label>
          <input
            id={`${id}-title`}
            name="mission-title"
            value={draft.title}
            onChange={(event) => onChange({ ...draft, title: event.target.value })}
            placeholder={t("missionsNative.titlePlaceholder")}
            disabled={busy}
            minLength={2}
            maxLength={160}
            required
            aria-invalid={titleInvalid}
            aria-describedby={`${id}-title-hint`}
            className="min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
          />
          <p id={`${id}-title-hint`} className="text-xs text-muted-foreground">
            {t("missionsNative.titleHint")}
          </p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-description`} className="text-sm font-medium">
            {t("missionsNative.descriptionLabel")}
          </label>
          <textarea
            id={`${id}-description`}
            name="mission-description"
            value={draft.description}
            onChange={(event) => onChange({ ...draft, description: event.target.value })}
            disabled={busy}
            maxLength={2000}
            rows={3}
            aria-describedby={`${id}-description-hint`}
            className="w-full min-w-0 resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
          />
          <p id={`${id}-description-hint`} className="text-xs text-muted-foreground">
            {t("missionsNative.descriptionHint")}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 space-y-1.5">
            <label htmlFor={`${id}-priority`} className="block text-sm font-medium">
              {t("missionsNative.priorityLabel")}
            </label>
            <select
              id={`${id}-priority`}
              name="mission-priority"
              value={draft.priority}
              onChange={(event) => onChange({ ...draft, priority: Number(event.target.value) })}
              disabled={busy}
              aria-describedby={`${id}-priority-hint`}
              className="min-h-11 rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
            >
              {Array.from({ length: 11 }, (_, priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={!canWrite || busy || !valid}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Plus aria-hidden="true" className="size-4" />
            {t(isSaving ? "missionsNative.saving" : "missionsNative.add")}
          </button>
        </div>
        <p id={`${id}-priority-hint`} className="text-xs text-muted-foreground">
          {t("missionsNative.priorityHint")}
        </p>
      </form>
    </section>
  );
}
