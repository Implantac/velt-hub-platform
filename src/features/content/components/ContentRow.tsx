import { MANUAL_CONTENT_STATUSES, type ManualContentStatus } from "@/lib/content/status";
import { useTranslation } from "react-i18next";
import { CheckSquare, LockKeyhole, Square } from "lucide-react";
import type { ContentBrowseItem } from "@/lib/content/browse";
import { STATUS_STYLES } from "../constants";
import { canModifyContent } from "../browse-state";

interface ContentRowProps {
  item: ContentBrowseItem;
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onStatusChange: (status: ManualContentStatus) => void;
}

export function ContentRow({
  item: c,
  selected,
  disabled = false,
  onToggle,
  onEdit,
  onStatusChange,
}: ContentRowProps) {
  const { t } = useTranslation();
  const locked = !canModifyContent(c);
  const lockHintId = `content-lock-${c.id}`;
  return (
    <div
      data-content-id={c.id}
      className={`section-card grid gap-2 p-3 transition sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-4 ${selected ? "border-primary ring-1 ring-primary/30" : ""}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || locked}
          onClick={onToggle}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
          aria-label={t(selected ? "content.unselect" : "content.select", {
            title: c.title || t("content.untitled"),
          })}
          aria-pressed={selected}
          aria-describedby={locked ? lockHintId : undefined}
        >
          {selected ? (
            <CheckSquare aria-hidden="true" className="size-5 text-primary" />
          ) : (
            <Square aria-hidden="true" className="size-5" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-medium [overflow-wrap:anywhere]">
            {c.title || t("content.untitled")}
          </h3>
          <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {c.brand?.name ?? t("content.noBrand")} ·{" "}
            {t(`content.${c.type}`, { defaultValue: c.type })}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-1 sm:pl-0">
        <span
          className={`mr-auto rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[c.status]}`}
        >
          {t(`content.${c.status}`)}
        </span>
        <button
          type="button"
          disabled={disabled || locked}
          onClick={onEdit}
          aria-label={t("content.editItem", { title: c.title || t("content.untitled") })}
          aria-describedby={locked ? lockHintId : undefined}
          className="min-h-11 rounded-md border border-input px-3 py-2 text-xs disabled:opacity-50"
        >
          {t("content.edit")}
        </button>
        <select
          disabled={disabled || locked}
          aria-label={t("content.status", { title: c.title || t("content.untitled") })}
          aria-describedby={locked ? lockHintId : undefined}
          value={c.status}
          onChange={(e) => onStatusChange(e.target.value as ManualContentStatus)}
          className="min-h-11 max-w-full rounded-md border border-input bg-background px-2 py-2 text-xs disabled:opacity-50"
        >
          {!MANUAL_CONTENT_STATUSES.some((s) => s === c.status) && (
            <option value={c.status} disabled>
              {t(`content.${c.status}`)}
            </option>
          )}
          {MANUAL_CONTENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`content.${s}`)}
            </option>
          ))}
        </select>
      </div>
      {locked && (
        <p
          id={lockHintId}
          className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground sm:col-span-2"
        >
          <LockKeyhole aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {t("content.deliveryLocked")}
        </p>
      )}
    </div>
  );
}
