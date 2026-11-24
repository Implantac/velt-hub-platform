import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createMission, listMissions, updateMissionStatus } from "@/lib/api/missions.functions";
import {
  confirmMissionCreation,
  confirmMissionPage,
  confirmMissionStatus,
  missionDraftSchema,
  missionStatusInputSchema,
  type MissionBrowse,
  type MissionDraft,
  type MissionFilter,
  type MissionRecord,
  type MissionStatus,
} from "@/lib/missions/contracts";
import {
  missionFeedbackAfterRead,
  missionsQueryKey,
  missionsQueryRoot,
  type MissionFeedback,
} from "../presentation";

/** Mounted only in a user/workspace-keyed, membership-checked page. */
export function useMissionsWorkspace(workspaceId: string, userId: string, canEdit: boolean) {
  const qc = useQueryClient();
  const list = useServerFn(listMissions);
  const create = useServerFn(createMission);
  const update = useServerFn(updateMissionStatus);
  const [browse, setBrowse] = useState<MissionBrowse>({ status: "all", page: 1 });
  const query = useQuery({
    queryKey: missionsQueryKey(workspaceId, userId, browse.status, browse.page),
    queryFn: async () => {
      const input = { workspaceId, ...browse };
      return confirmMissionPage(await list({ data: input }), input);
    },
    // Returning to a visited page must re-read it after concurrent changes.
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const [draft, setDraft] = useState<MissionDraft>({ title: "", description: "", priority: 0 });
  const [pending, setPending] = useState<"create" | "status" | "refresh" | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<MissionFeedback | null>(null);
  const [review, setReview] = useState<{ refreshed: boolean } | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const mounted = useRef(false);
  const locked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const canWrite =
    canEdit &&
    pending === null &&
    !review &&
    query.data !== undefined &&
    !query.isError &&
    !query.isFetching;
  const invalidateScope = () => {
    // Invalidation does not refetch under a different identity or generate Brain/AI.
    void qc.invalidateQueries({
      queryKey: missionsQueryRoot(workspaceId, userId),
      refetchType: "none",
    });
    void qc.invalidateQueries({
      queryKey: ["dashboard", workspaceId, userId],
      refetchType: "none",
    });
  };
  const read = async () => {
    try {
      const result = await query.refetch({ cancelRefetch: false });
      return !result.isError && result.data !== undefined;
    } catch {
      return false;
    }
  };
  const perform = async (
    action: "create" | "status",
    task: () => Promise<MissionFeedback>,
    afterConfirmed?: () => void,
    missionId?: string,
  ) => {
    if (locked.current || !canWrite) return;
    locked.current = true;
    setPending(action);
    setUpdatingId(missionId ?? null);
    setFeedback(null);
    try {
      const result = await task();
      invalidateScope();
      if (!mounted.current) return;
      afterConfirmed?.();
      const readConfirmed = await read();
      if (mounted.current) setFeedback({ ...result, readFailed: !readConfirmed });
    } catch {
      invalidateScope();
      if (mounted.current) {
        setReview({ refreshed: false });
        setReviewConfirmed(false);
        setFeedback({ kind: "unconfirmed" });
      }
    } finally {
      locked.current = false;
      if (mounted.current) {
        setPending(null);
        setUpdatingId(null);
      }
    }
  };
  const save = async () => {
    const parsed = missionDraftSchema.safeParse(draft);
    if (!parsed.success) return;
    const originalDraft = draft;
    const input = { workspaceId, ...parsed.data };
    await perform(
      "create",
      async () => {
        const receipt = confirmMissionCreation(await create({ data: input }), input, userId);
        return { kind: "created", eventMissing: !receipt.eventRecorded };
      },
      () =>
        setDraft((current) =>
          current.title === originalDraft.title &&
          current.description === originalDraft.description &&
          current.priority === originalDraft.priority
            ? { title: "", description: "", priority: 0 }
            : current,
        ),
    );
  };
  const changeStatus = async (mission: MissionRecord, status: MissionStatus) => {
    const isCurrent = query.data?.items.some(
      (item) =>
        item.id === mission.id &&
        item.status === mission.status &&
        item.updated_at === mission.updated_at,
    );
    if (!isCurrent) return;
    const parsed = missionStatusInputSchema.safeParse({
      workspaceId,
      id: mission.id,
      status,
      expectedStatus: mission.status,
      expectedUpdatedAt: mission.updated_at,
    });
    if (!parsed.success) return;
    await perform(
      "status",
      async () => {
        confirmMissionStatus(await update({ data: parsed.data }), parsed.data);
        return { kind: "statusSaved" };
      },
      undefined,
      mission.id,
    );
  };
  const refresh = async () => {
    if (locked.current || query.isFetching) return;
    locked.current = true;
    setPending("refresh");
    setReviewConfirmed(false);
    try {
      const confirmed = await read();
      if (mounted.current) {
        setReview((current) => (current ? { refreshed: confirmed } : null));
        setFeedback((current) => missionFeedbackAfterRead(current, confirmed));
      }
    } finally {
      locked.current = false;
      if (mounted.current) setPending(null);
    }
  };
  const changeBrowse = (next: MissionBrowse) => {
    if (locked.current || query.isFetching) return;
    setBrowse(next);
    setReviewConfirmed(false);
    setReview((current) => (current ? { refreshed: false } : null));
    setFeedback((current) => (current?.kind === "unconfirmed" ? current : null));
  };
  const setFilter = (status: MissionFilter) => changeBrowse({ status, page: 1 });
  const setPage = (page: number) => changeBrowse({ ...browse, page });
  const resumeAfterReview = () => {
    if (
      locked.current ||
      !review?.refreshed ||
      !reviewConfirmed ||
      query.data === undefined ||
      query.isError ||
      query.isFetching
    )
      return;
    // Explicit acknowledgement only. Never repeats the failed/uncertain POST.
    setReview(null);
    setReviewConfirmed(false);
    setFeedback(null);
  };
  return {
    query,
    browse,
    setFilter,
    setPage,
    draft,
    setDraft,
    pending,
    updatingId,
    feedback,
    review,
    reviewConfirmed,
    setReviewConfirmed,
    resumeAfterReview,
    canWrite,
    save,
    changeStatus,
    refresh,
  };
}
