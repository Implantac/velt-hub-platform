import { useState } from "react";
import { ContentEditorDialog } from "./ContentEditorDialog";
import { type ManualContentStatus } from "@/lib/content/status";
import { useTranslation } from "react-i18next";
import { CheckSquare, Square } from "lucide-react";
import { ListSkeleton } from "@/components/app/Skeletons";
import { QueryErrorState } from "@/features/shell/components/QueryErrorState";
import type { ContentBrowseItem } from "@/lib/content/browse";
import { ContentRow } from "./ContentRow";
import { ContentEmptyAll, ContentEmptyFiltered } from "./ContentEmpty";
import { canModifyContent } from "../browse-state";

type Props = {
  items: ContentBrowseItem[];
  workspaceTotal?: number;
  isLoading: boolean;
  isError: boolean;
  retryPending: boolean;
  onRetry: () => void;
  disabled?: boolean;
  selected: Set<string>;
  selectableCount: number;
  allVisibleSelected: boolean;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onStatusChange: (id: string, status: ManualContentStatus) => void;
  onClearFilters: () => void;
};

export function ContentList({
  items,
  workspaceTotal,
  isLoading,
  isError,
  retryPending,
  onRetry,
  disabled = false,
  selected,
  selectableCount,
  allVisibleSelected,
  onToggleAll,
  onToggleOne,
  onStatusChange,
  onClearFilters,
}: Props) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<ContentBrowseItem | null>(null);
  return (
    <section
      className="space-y-2"
      aria-label={t("content.libraryResults")}
      aria-busy={isLoading || retryPending}
    >
      {/* Keep this mounted through a list refetch/error. Never reinitialize a user's local draft. */}
      {editing && (
        <ContentEditorDialog
          key={editing.id}
          item={editing}
          onClose={() => setEditing(null)}
          onRefresh={onRetry}
          refreshPending={isLoading || retryPending}
          saveDisabled={
            disabled || isError || !items.some((i) => i.id === editing.id && canModifyContent(i))
          }
        />
      )}
      {isError && <QueryErrorState onRetry={onRetry} pending={retryPending} />}
      {items.length > 0 && (
        <>
          <button
            type="button"
            disabled={disabled || selectableCount === 0}
            onClick={onToggleAll}
            aria-pressed={allVisibleSelected}
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            {allVisibleSelected ? (
              <CheckSquare aria-hidden="true" className="size-5" />
            ) : (
              <Square aria-hidden="true" className="size-5" />
            )}
            {t(allVisibleSelected ? "content.unselectPage" : "content.selectPage", {
              count: selectableCount,
            })}
          </button>
          <p className="pb-2 text-xs text-muted-foreground">{t("content.selectionScope")}</p>
        </>
      )}
      {items.map((c) => (
        <ContentRow
          key={c.id}
          item={c}
          disabled={disabled || isError}
          selected={selected.has(c.id)}
          onToggle={() => onToggleOne(c.id)}
          onEdit={() => {
            if (!disabled && !isError && canModifyContent(c)) setEditing(c);
          }}
          onStatusChange={(status) => onStatusChange(c.id, status)}
        />
      ))}
      {isLoading && items.length === 0 && <ListSkeleton rows={4} />}
      {!isLoading &&
        !isError &&
        items.length === 0 &&
        workspaceTotal !== undefined &&
        (workspaceTotal === 0 ? (
          <ContentEmptyAll />
        ) : (
          <ContentEmptyFiltered onClear={onClearFilters} />
        ))}
    </section>
  );
}
