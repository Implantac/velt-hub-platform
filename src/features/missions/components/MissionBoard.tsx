import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { MISSION_STATUSES, type MissionRecord, type MissionStatus } from "@/lib/missions/contracts";
import { missionDate, missionLanguage } from "../presentation";

type Props = {
  missions: MissionRecord[];
  canEdit: boolean;
  canWrite: boolean;
  updatingId: string | null;
  onMove: (mission: MissionRecord, status: MissionStatus) => void;
};

export function MissionBoard({ missions, canEdit, canWrite, updatingId, onMove }: Props) {
  const { t, i18n } = useTranslation();
  const nf = new Intl.NumberFormat(missionLanguage(i18n.language));
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {MISSION_STATUSES.map((status) => {
        const items = missions.filter((mission) => mission.status === status);
        return (
          <section
            key={status}
            aria-label={t(`missionsNative.status.${status}`)}
            className="section-card min-w-0 space-y-3 p-3 sm:p-4"
          >
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">{t(`missionsNative.status.${status}`)}</h2>
              <p className="text-xs text-muted-foreground">
                {t("missionsNative.inPage", { value: nf.format(items.length) })}
              </p>
            </div>
            <div className="space-y-3">
              {items.map((mission) => (
                <MissionCard
                  key={`${mission.id}:${mission.updated_at}`}
                  mission={mission}
                  canEdit={canEdit}
                  canWrite={canWrite}
                  isSaving={updatingId === mission.id}
                  onMove={onMove}
                />
              ))}
              {items.length === 0 && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("missionsNative.emptyColumn")}
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function MissionCard({
  mission,
  canEdit,
  canWrite,
  isSaving,
  onMove,
}: {
  mission: MissionRecord;
  canEdit: boolean;
  canWrite: boolean;
  isSaving: boolean;
  onMove: Props["onMove"];
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const [target, setTarget] = useState<MissionStatus>(mission.status);
  const title = mission.title.trim() ? mission.title : t("missionsNative.untitled");
  const date = (value: string) =>
    missionDate(value, i18n.language) ?? t("missionsNative.dateUnavailable");
  return (
    <article
      aria-labelledby={`${id}-heading`}
      className="min-w-0 space-y-3 rounded-xl border border-border bg-background/50 p-3 text-sm"
    >
      <h3 id={`${id}-heading`} className="break-words font-semibold [overflow-wrap:anywhere]">
        {title}
      </h3>
      {mission.description && (
        <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
          {mission.description}
        </p>
      )}
      <dl className="space-y-1.5 text-xs text-muted-foreground">
        <div className="flex flex-wrap gap-x-1">
          <dt>{t("missionsNative.priorityLabel")}:</dt>
          <dd>{new Intl.NumberFormat(missionLanguage(i18n.language)).format(mission.priority)}</dd>
        </div>
        <div>
          <dt>{t("missionsNative.updatedAt")}</dt>
          <dd>
            <time dateTime={mission.updated_at}>{date(mission.updated_at)}</time>
          </dd>
        </div>
        {mission.due_at && (
          <div>
            <dt>{t("missionsNative.dueAt")}</dt>
            <dd>
              <time dateTime={mission.due_at}>{date(mission.due_at)}</time>
            </dd>
          </div>
        )}
      </dl>
      {canEdit && (
        <form
          className="space-y-2 border-t border-border pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (canWrite && !isSaving && target !== mission.status) onMove(mission, target);
          }}
          aria-busy={isSaving}
        >
          <label htmlFor={`${id}-status`} className="block text-xs font-medium">
            {t("missionsNative.manualStatus")}
          </label>
          <select
            id={`${id}-status`}
            aria-label={t("missionsNative.statusFor", { title })}
            value={target}
            onChange={(event) => setTarget(event.target.value as MissionStatus)}
            disabled={!canWrite || isSaving}
            className="min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-2 py-2 text-sm disabled:opacity-50"
          >
            {MISSION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`missionsNative.status.${status}`)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            aria-label={t("missionsNative.saveStatusFor", { title })}
            disabled={!canWrite || isSaving || target === mission.status}
            className="min-h-11 w-full rounded-lg border border-border bg-secondary px-2 py-2 text-sm font-medium disabled:opacity-50"
          >
            {t(isSaving ? "missionsNative.savingStatus" : "missionsNative.saveStatus")}
          </button>
        </form>
      )}
    </article>
  );
}
