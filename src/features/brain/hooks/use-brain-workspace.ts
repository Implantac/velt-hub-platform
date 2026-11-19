import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  addMemory,
  listMemories,
  listRecommendations,
  runBrainRecommend,
  updateRecommendation,
} from "@/lib/api/brain.functions";
import {
  brainMemoryInputSchema,
  nativeGenerationSchema,
  nativeMemoriesSchema,
  nativeMemorySchema,
  nativeRecommendationsSchema,
  nativeStatusReceiptSchema,
  type BrainLanguage,
  type BrainStatusChange,
  type MemoryKind,
} from "@/lib/brain/native";
import { brainQueryKey, type BrainReadModule } from "../presentation";

export type BrainFeedback = {
  kind:
    | "generated"
    | "noRules"
    | "memorySaved"
    | "statusSaved"
    | "unconfirmed"
    | "refreshed"
    | "refreshPartial";
  count?: number;
  eventMissing?: boolean;
  readFailed?: boolean;
  module?: BrainReadModule;
};
type Pending = "generate" | "memory" | "status" | "refresh" | null;

/** Scoped to a keyed, membership-checked page. Never retries a POST automatically. */
export function useBrainWorkspace(
  workspaceId: string,
  userId: string,
  canEdit: boolean,
  language: BrainLanguage,
) {
  const qc = useQueryClient();
  const fetchRecs = useServerFn(listRecommendations);
  const fetchMem = useServerFn(listMemories);
  const run = useServerFn(runBrainRecommend);
  const save = useServerFn(addMemory);
  const update = useServerFn(updateRecommendation);
  const recommendations = useQuery({
    queryKey: brainQueryKey("recommendations", workspaceId, userId),
    queryFn: async () =>
      nativeRecommendationsSchema.parse(await fetchRecs({ data: { workspaceId } })),
    staleTime: 30_000,
    retry: 1,
  });
  const memories = useQuery({
    queryKey: brainQueryKey("memories", workspaceId, userId),
    queryFn: async () => nativeMemoriesSchema.parse(await fetchMem({ data: { workspaceId } })),
    staleTime: 30_000,
    retry: 1,
  });
  const [memText, setMemText] = useState("");
  const [memKind, setMemKind] = useState<MemoryKind>("goal");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [feedback, setFeedback] = useState<BrainFeedback | null>(null);
  const [review, setReview] = useState({ recommendations: false, memories: false });
  const mounted = useRef(false);
  const locked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const readyToWrite = (module: BrainReadModule) => {
    const query = module === "recommendations" ? recommendations : memories;
    return (
      canEdit &&
      !pending &&
      !review[module] &&
      query.data !== undefined &&
      !query.isError &&
      !query.isFetching
    );
  };
  const read = async (module: BrainReadModule) => {
    const query = module === "recommendations" ? recommendations : memories;
    try {
      const result = await query.refetch({ cancelRefetch: false });
      const confirmedRead = !result.isError && result.data !== undefined;
      if (mounted.current && confirmedRead) {
        setReview((current) => ({ ...current, [module]: false }));
        const other = module === "recommendations" ? "memories" : "recommendations";
        const otherConfirmed =
          qc.getQueryState(brainQueryKey(other, workspaceId, userId))?.status === "success";
        setFeedback((current) => {
          if (current?.kind === "refreshPartial" && otherConfirmed) return { kind: "refreshed" };
          return current?.module === module ? { ...current, readFailed: false } : current;
        });
      }
      return confirmedRead;
    } catch {
      return false;
    }
  };
  const retry = async (module: BrainReadModule) => {
    await read(module);
  };
  const perform = async (
    action: Exclude<Pending, "refresh" | null>,
    module: BrainReadModule,
    task: () => Promise<BrainFeedback>,
    afterConfirmed?: () => void,
  ) => {
    if (locked.current || !readyToWrite(module)) return;
    locked.current = true;
    setPending(action);
    setFeedback(null);
    try {
      const outcome = await task();
      // A late write result cannot refetch with another identity or clear its form.
      if (!mounted.current) {
        void qc.invalidateQueries({
          queryKey: brainQueryKey(module, workspaceId, userId),
          refetchType: "none",
        });
        return;
      }
      afterConfirmed?.();
      const confirmedRead = await read(module);
      if (mounted.current) {
        if (!confirmedRead) setReview((current) => ({ ...current, [module]: true }));
        setFeedback({ ...outcome, module, readFailed: !confirmedRead });
      }
      // Dashboard refresh is also read-only. Never invalidate another user's scope.
      void qc.invalidateQueries({
        queryKey: ["dashboard", workspaceId, userId],
        refetchType: "none",
      });
    } catch {
      if (mounted.current) {
        setReview((current) => ({ ...current, [module]: true }));
        setFeedback({ kind: "unconfirmed", module });
      }
    } finally {
      locked.current = false;
      if (mounted.current) setPending(null);
    }
  };
  const generate = async () => {
    if (!confirmed || locked.current || !readyToWrite("recommendations")) return;
    setConfirmed(false);
    await perform("generate", "recommendations", async () => {
      const result = nativeGenerationSchema.parse(await run({ data: { workspaceId, language } }));
      return {
        kind: result.generated === 0 ? "noRules" : "generated",
        count: result.generated,
        eventMissing: result.generated > 0 && !result.eventRecorded,
      };
    });
  };
  const saveMemory = async () => {
    const parsed = brainMemoryInputSchema.safeParse({ content: memText, kind: memKind });
    if (!parsed.success) return;
    const originalText = memText;
    await perform(
      "memory",
      "memories",
      async () => {
        const result = nativeMemorySchema.parse(
          await save({ data: { workspaceId, ...parsed.data } }),
        );
        if (result.content !== parsed.data.content || result.kind !== parsed.data.kind)
          throw new Error("Unconfirmed memory");
        return { kind: "memorySaved" };
      },
      () => setMemText((current) => (current === originalText ? "" : current)),
    );
  };
  const setStatus = async (id: string, status: BrainStatusChange) => {
    await perform("status", "recommendations", async () => {
      const receipt = nativeStatusReceiptSchema.parse(
        await update({ data: { workspaceId, id, status } }),
      );
      if (receipt.id !== id || receipt.workspace_id !== workspaceId || receipt.status !== status)
        throw new Error("Unconfirmed status change");
      return { kind: "statusSaved" };
    });
  };
  const refresh = async () => {
    if (locked.current) return;
    locked.current = true;
    setPending("refresh");
    setFeedback(null);
    try {
      const reads = await Promise.all([read("recommendations"), read("memories")]);
      if (mounted.current)
        setFeedback({ kind: reads.every(Boolean) ? "refreshed" : "refreshPartial" });
    } finally {
      locked.current = false;
      if (mounted.current) setPending(null);
    }
  };
  return {
    recommendations,
    memories,
    memText,
    setMemText,
    memKind,
    setMemKind,
    confirmed,
    setConfirmed,
    pending,
    feedback,
    review,
    canWriteRecommendations: readyToWrite("recommendations"),
    canWriteMemories: readyToWrite("memories"),
    generate,
    saveMemory,
    setStatus,
    refresh,
    retry,
  };
}
