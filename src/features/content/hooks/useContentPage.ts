import { parseMediaInput } from "@/lib/content/media";
import { type ManualContentStatus } from "@/lib/content/status";
import {
  CONTENT_PAGE_SIZE,
  normalizeContentSearchInput,
  parseContentPage,
  type ContentBrowseInput,
  type ContentCursor,
  type ContentPage,
} from "@/lib/content/browse";
import { useWorkspaceAccess } from "@/lib/workspace/use-workspace-access";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  bulkDeleteContent,
  bulkUpdateContentStatus,
  createContent,
  getContentPage,
  updateContentStatus,
} from "@/lib/api/content.functions";
import { useWorkspaceMutation, useWorkspaceQuery } from "@/lib/query/use-workspace-query";
import { normalizeMutationError } from "@/lib/query/errors";
import { type FilterValue } from "../constants";
import {
  canModifyContent,
  contentPageScope,
  currentPageSelection,
  type PageSelection,
} from "../browse-state";

export function useContentPage() {
  const { t } = useTranslation();
  const access = useWorkspaceAccess();
  const qc = useQueryClient();
  const list = useServerFn(getContentPage);
  const create = useServerFn(createContent);
  const updateStatus = useServerFn(updateContentStatus);
  const bulkStatus = useServerFn(bulkUpdateContentStatus);
  const bulkDelete = useServerFn(bulkDeleteContent);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mediaInput, setMediaInput] = useState("");
  const [filter, updateFilter] = useState<FilterValue>("all");
  const [search, updateSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [cursors, setCursors] = useState<(ContentCursor | null)[]>([null]);
  const [selection, setSelection] = useState<PageSelection>({ scope: "", ids: [] });
  const [mutationPending, setMutationPending] = useState(false);
  // Synchronous exclusion also covers two clicks before React commits disabled controls.
  const mutationLock = useRef(false);
  const cursor = cursors[cursors.length - 1];
  const searchPending = search.trim() !== appliedSearch;

  useEffect(() => {
    if (!searchPending) return;
    const timer = window.setTimeout(() => {
      setAppliedSearch(search.trim());
      setCursors([null]);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, searchPending]);

  const q = useWorkspaceQuery<ContentPage>(
    (wsId) => ["content", wsId, "browse", filter, appliedSearch, cursor],
    async ({ workspaceId }) => {
      const input: ContentBrowseInput = {
        workspaceId,
        status: filter,
        search: appliedSearch,
        cursor,
        limit: CONTENT_PAGE_SIZE,
      };
      return parseContentPage(await list({ data: input }), input);
    },
    { retry: false },
  );
  const relatedKeys = ["content", "scheduler-options", "scheduler", "analytics"].map((key) =>
    q.wsId ? [key, q.wsId] : [key],
  );
  const invalidateViews = () =>
    Promise.all(relatedKeys.map((queryKey) => qc.invalidateQueries({ queryKey })));
  const items = useMemo(() => q.data?.items ?? [], [q.data]);
  const scope = contentPageScope(q.wsId, filter, appliedSearch, cursor);
  const selected = currentPageSelection(selection, scope, items, access.canEdit);
  const selectable = items.filter(canModifyContent);
  const allVisibleSelected = selectable.length > 0 && selectable.every((c) => selected.has(c.id));

  // A concurrent lock/deletion must remove the stored target too, not merely hide its checkbox.
  useEffect(() => {
    setSelection((old) => {
      const ids = [...currentPageSelection(old, scope, items, access.canEdit)];
      return old.scope === scope && JSON.stringify(old.ids) === JSON.stringify(ids)
        ? old
        : { scope, ids };
    });
  }, [scope, items, access.canEdit]);

  const clearSelection = () => setSelection({ scope, ids: [] });
  const resetNavigation = () => {
    setCursors([null]);
    clearSelection();
  };
  const setFilter = (value: FilterValue) => {
    if (value === filter) return;
    updateFilter(value);
    resetNavigation();
  };
  const setSearch = (value: string) => {
    updateSearch(normalizeContentSearchInput(value));
    clearSelection();
  };
  const clearFilters = () => {
    updateFilter("all");
    updateSearch("");
    setAppliedSearch("");
    resetNavigation();
  };
  const readPending = !q.wsId || q.isPending || q.isFetching || searchPending;
  const createMut = useWorkspaceMutation(
    () => {
      if (!q.wsId || !access.canEdit || mutationLock.current)
        throw new Error(t("common.mutationError"));
      return create({
        data: {
          workspaceId: q.wsId,
          title: title.trim(),
          body,
          type: "post",
          mediaUrls: parseMediaInput(mediaInput),
        },
      });
    },
    {
      invalidate: relatedKeys,
      successMessage: t("content.created"),
      onSuccess: () => {
        setTitle("");
        setBody("");
        setMediaInput("");
      },
    },
  );
  const operationsPending = mutationPending || createMut.isPending;
  const navigationDisabled = readPending || operationsPending;
  const actionsDisabled =
    navigationDisabled || !q.isSuccess || !access.canEdit || access.isFetching;
  const createDraft = () => {
    if (!actionsDisabled) createMut.mutate();
  };
  const toggleAll = () => {
    if (actionsDisabled) return;
    setSelection({ scope, ids: allVisibleSelected ? [] : selectable.map((c) => c.id) });
  };
  const toggleOne = (id: string) => {
    if (actionsDisabled || !items.some((c) => c.id === id && canModifyContent(c))) return;
    setSelection((old) => {
      const next = currentPageSelection(old, scope, items, access.canEdit);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { scope, ids: [...next] };
    });
  };
  const performMutation = async (operation: () => Promise<unknown>) => {
    if (actionsDisabled || mutationLock.current) return;
    mutationLock.current = true;
    setMutationPending(true);
    try {
      await operation();
      clearSelection();
    } catch (reason) {
      toast.error(normalizeMutationError(reason, t("common.mutationError")).message);
    } finally {
      try {
        await invalidateViews();
      } finally {
        mutationLock.current = false;
        setMutationPending(false);
      }
    }
  };
  const changeStatus = (id: string, status: ManualContentStatus) => {
    const row = items.find((c) => c.id === id);
    if (!q.wsId || !row || !canModifyContent(row) || row.status === status) return;
    void performMutation(() => updateStatus({ data: { id, status, workspaceId: q.wsId! } }));
  };
  // Re-evaluate the current, editable page at the actual click, never send a stored hidden ID.
  const targets = () => [...currentPageSelection(selection, scope, items, access.canEdit)];
  const runBulkStatus = (status: ManualContentStatus) => {
    const ids = targets();
    if (!q.wsId || !ids.length) return;
    void performMutation(async () => {
      const r = await bulkStatus({ data: { workspaceId: q.wsId!, ids, status } });
      if (r.missingCount)
        toast.warning(t("content.partial", { count: r.count, missing: r.missingCount }));
      else toast.success(t("content.moved", { count: r.count, status: t(`content.${status}`) }));
    });
  };
  const runBulkDelete = () => {
    if (actionsDisabled || !q.wsId || !targets().length) return;
    if (!window.confirm(t("content.confirmDelete", { count: targets().length }))) return;
    const ids = targets();
    if (!ids.length) return;
    void performMutation(async () => {
      const r = await bulkDelete({ data: { workspaceId: q.wsId!, ids } });
      if (r.missingCount)
        toast.warning(t("content.partial", { count: r.count, missing: r.missingCount }));
      else toast.success(t("content.deleted", { count: r.count }));
    });
  };
  const nextPage = () => {
    if (navigationDisabled || !q.isSuccess || !q.data.nextCursor) return;
    setCursors((old) => [...old, q.data!.nextCursor]);
    clearSelection();
  };
  const previousPage = () => {
    if (navigationDisabled || cursors.length < 2) return;
    setCursors((old) => old.slice(0, -1));
    clearSelection();
  };

  return {
    access,
    q,
    items,
    counts: q.isSuccess && !searchPending ? q.data.counts : undefined,
    workspaceTotal: q.data?.workspaceTotal,
    readPending,
    actionsDisabled,
    operationsPending,
    navigationDisabled,
    pageNumber: cursors.length,
    hasPrevious: cursors.length > 1,
    hasNext: q.isSuccess && !!q.data.nextCursor,
    nextPage,
    previousPage,
    title,
    setTitle,
    body,
    setBody,
    mediaInput,
    setMediaInput,
    filter,
    setFilter,
    search,
    setSearch,
    searchPending,
    selected,
    clearSelection,
    selectableCount: selectable.length,
    allVisibleSelected,
    toggleAll,
    toggleOne,
    createMut,
    createDraft,
    changeStatus,
    runBulkStatus,
    runBulkDelete,
    clearFilters,
  };
}
