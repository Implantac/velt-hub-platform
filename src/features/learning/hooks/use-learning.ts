import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listLearningPaths,
  listMyProgress,
  setMilestoneCompletion,
} from "@/lib/api/learning.functions";
import {
  confirmLearningPage,
  confirmLearningProgressBatch,
  confirmLearningReceipt,
  learningCatalogVersion,
  learningProgressFor,
  type LearningPath,
  type LearningReceipt,
} from "@/lib/learning/contracts";
import {
  learningCatalogKey,
  learningIntentMatches,
  learningLastPage,
  learningProgressKey,
  learningViewKey,
  type LearningView,
} from "../presentation";
import { learningOperations } from "../operation-store";
import { supabase } from "@/integrations/supabase/client";
import { learningAccountRequest } from "../account-guard";

const initialView: LearningView = { page: 1, intent: null, receipt: null };
/** Personal account state. The shell may remount on workspace switch; no workspace key or role. */
export function useLearning(userId: string) {
  const qc = useQueryClient();
  const list = useServerFn(listLearningPaths),
    getProgress = useServerFn(listMyProgress),
    record = useServerFn(setMilestoneCompletion);
  const viewQuery = useQuery<LearningView>({
    queryKey: learningViewKey(userId),
    queryFn: async () => initialView,
    enabled: false,
    initialData: initialView,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
  });
  const view = viewQuery.data ?? initialView;
  const setView = (update: (current: LearningView) => LearningView) =>
    qc.setQueryData<LearningView>(learningViewKey(userId), (current) =>
      update(current ?? initialView),
    );
  const forAccount = <T>(call: () => Promise<T>) =>
    learningAccountRequest(userId, () => supabase.auth.getSession(), call);
  const catalogOptions = (page: number) => ({
    queryKey: learningCatalogKey(userId, page),
    queryFn: async () =>
      confirmLearningPage(await forAccount(() => list({ data: { page } })), { page }),
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const progressOptions = (paths: LearningPath[]) => ({
    queryKey: learningProgressKey(userId, paths),
    queryFn: async () => {
      const input = { accountId: userId, pathIds: paths.map((path) => path.id) };
      return confirmLearningProgressBatch(
        await forAccount(() => getProgress({ data: input })),
        input,
        userId,
      );
    },
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const catalog = useQuery(catalogOptions(view.page));
  const paths = catalog.data?.items ?? [];
  const progress = useQuery({
    ...progressOptions(paths),
    enabled: paths.length > 0 && !catalog.isError,
  });
  const operation = useSyncExternalStore(
    (listener) => learningOperations.subscribe(userId, listener),
    () => learningOperations.snapshot(userId),
    learningOperations.serverSnapshot,
  );
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [saveAck, setSaveAck] = useState<string | null>(null),
    [reviewAck, setReviewAck] = useState<string | null>(null);
  const fetching = catalog.isFetching || (paths.length > 0 && progress.isFetching);
  const busy = operation.pending || operation.reading;
  const readReady =
    catalog.data !== undefined &&
    !catalog.isError &&
    !catalog.isFetching &&
    (paths.length === 0 ||
      (progress.data !== undefined && !progress.isError && !progress.isFetching));
  const readToken =
    readReady && !busy
      ? `${view.page}:${catalog.dataUpdatedAt}:${catalog.errorUpdatedAt}:${progress.dataUpdatedAt}:${progress.errorUpdatedAt}`
      : null;
  const acknowledged = readToken !== null && saveAck === readToken;
  const reviewConfirmed = readToken !== null && reviewAck === readToken;
  const selectedPath = paths.find((path) => path.id === view.intent?.pathId);
  const selectedProgress =
    selectedPath && progress.data ? learningProgressFor(progress.data, selectedPath.id) : undefined;
  const intentMatches =
    !!view.intent && learningIntentMatches(view.intent, selectedPath, selectedProgress);
  const canChoose = readReady && !busy && !operation.review && !view.intent;
  const canSave =
    !!view.intent && intentMatches && readReady && !busy && !operation.review && acknowledged;
  const resetAcks = () => {
    setSaveAck(null);
    setReviewAck(null);
  };
  const invalidate = () => {
    for (const part of ["catalog", "progress"])
      void qc.invalidateQueries({ queryKey: ["learning", userId, part], refetchType: "none" });
  };
  const reread = async (page: number) => {
    try {
      const fresh = await qc.fetchQuery(catalogOptions(page));
      // Do not start a second RPC with a possibly changed Auth identity after unmount.
      if (!mounted.current) return false;
      if (fresh.items.length) await qc.fetchQuery(progressOptions(fresh.items));
      return mounted.current;
    } catch {
      return false;
    }
  };
  const refresh = async () => {
    if (fetching || !learningOperations.startRead(userId)) return;
    resetAcks();
    const fresh = await reread(view.page);
    if (fresh) setView((current) => ({ ...current, receipt: null }));
    learningOperations.endRead(userId, fresh);
  };
  const choose = (pathId: string, milestoneId: string) => {
    const state = learningOperations.snapshot(userId);
    if (!canChoose || state.pending || state.reading || state.review || !progress.data) return;
    const path = paths.find((item) => item.id === pathId);
    if (!path?.milestones.some((item) => item.id === milestoneId)) return;
    const current = learningProgressFor(progress.data, pathId);
    setView((old) => ({
      ...old,
      receipt: null,
      intent: {
        pathId,
        milestoneId,
        completed: !current?.completed_milestones.includes(milestoneId),
        expectedCatalog: learningCatalogVersion(path),
        expectedProgress: current,
        observedPath: path,
      },
    }));
    resetAcks();
  };
  const cancel = () => {
    const state = learningOperations.snapshot(userId);
    if (state.pending || state.reading || state.review) return;
    setView((current) => ({ ...current, intent: null }));
    resetAcks();
  };
  const save = async () => {
    if (!canSave || !view.intent || !selectedPath) return;
    const reference = crypto.randomUUID();
    if (!learningOperations.begin(userId, reference)) return;
    const { pathId, milestoneId, completed, expectedCatalog, expectedProgress } = view.intent;
    const input = {
      accountId: userId,
      pathId,
      milestoneId,
      completed,
      expectedCatalog,
      expectedProgress,
      operationId: reference,
    };
    let receipt: LearningReceipt;
    try {
      receipt = confirmLearningReceipt(
        await forAccount(() => record({ data: input })),
        input,
        selectedPath,
        userId,
      );
    } catch {
      invalidate();
      learningOperations.finish(userId, reference, {
        kind: "unconfirmed",
        reference,
        readFailed: true,
      });
      if (mounted.current) resetAcks();
      return;
    }
    // Receipt is primary success; a later GET cannot downgrade it to uncertain or invite replay.
    invalidate();
    setView((current) => ({ ...current, intent: null, receipt }));
    if (mounted.current) resetAcks();
    const fresh = mounted.current ? await reread(view.page) : false;
    if (fresh) setView((current) => ({ ...current, receipt: null }));
    learningOperations.finish(userId, reference, {
      kind: receipt.mode === "unchanged" ? "unchanged" : "saved",
      reference,
      readFailed: !fresh,
    });
  };
  const resume = () => {
    if (!learningOperations.resume(userId, reviewConfirmed, readReady)) return;
    // Explicitly abandon the old intent: a new state selection is required, never an automatic replay/rebase.
    setView((current) => ({ ...current, intent: null }));
    resetAcks();
  };
  const changePage = (page: number) => {
    const state = learningOperations.snapshot(userId);
    if (
      !catalog.data ||
      !readReady ||
      fetching ||
      state.pending ||
      state.reading ||
      state.review ||
      view.intent ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > learningLastPage(catalog.data)
    )
      return;
    setView((current) => ({ ...current, page, receipt: null }));
    resetAcks();
  };
  return {
    view,
    catalog,
    progress,
    paths,
    operation,
    busy,
    fetching,
    readReady,
    canChoose,
    canSave,
    selectedPath,
    selectedProgress,
    intentMatches,
    acknowledged,
    reviewConfirmed,
    setAcknowledged: (value: boolean) => setSaveAck(value ? readToken : null),
    setReviewConfirmed: (value: boolean) => setReviewAck(value ? readToken : null),
    refresh,
    choose,
    cancel,
    save,
    resume,
    changePage,
  };
}
