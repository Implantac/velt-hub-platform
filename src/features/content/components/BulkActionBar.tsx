import { MANUAL_CONTENT_STATUSES, type ManualContentStatus } from "@/lib/content/status";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";

interface BulkActionBarProps {
  count: number;
  disabled?: boolean;
  onMoveTo: (status: ManualContentStatus) => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkActionBar({
  count,
  disabled = false,
  onMoveTo,
  onDelete,
  onClear,
}: BulkActionBarProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
      <span className="font-medium">{t("content.selectedOnPage", { count })}</span>
      <span className="text-muted-foreground">·</span>
      {MANUAL_CONTENT_STATUSES.map((s) => (
        <button
          key={s}
          disabled={disabled}
          onClick={() => onMoveTo(s)}
          className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-secondary disabled:opacity-50"
        >
          {t("content.moveTo", { status: t(`content.${s}`) })}
        </button>
      ))}
      <button
        disabled={disabled}
        onClick={onDelete}
        className="inline-flex min-h-11 items-center gap-1 rounded-md bg-destructive/15 px-3 py-2 text-xs text-destructive hover:bg-destructive/25 disabled:opacity-50 sm:ml-auto"
      >
        <Trash2 aria-hidden="true" className="size-3" /> {t("content.delete")}
      </button>
      <button
        disabled={disabled}
        onClick={onClear}
        className="min-h-11 rounded-md px-3 py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        {t("content.clear")}
      </button>
    </div>
  );
}
