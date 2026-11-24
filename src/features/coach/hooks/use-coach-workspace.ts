import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  generateRecommendations,
  listJourney,
  listRecommendations,
  updateRecommendation,
} from "@/lib/api/coach.functions";
import {
  coachBrowseSchema,
  coachState,
  confirmCoachGeneration,
  confirmCoachPage,
  confirmCoachStatus,
  confirmJourneyPage,
  journeyListInputSchema,
  type CoachBrowse,
  type CoachFilter,
  type CoachRecord,
} from "@/lib/coach/contracts";
import { coachQueryKey, coachQueryRoot, type CoachFeedback } from "../presentation";
import { coachOperations } from "../operation-store";

export type CoachProposal =
  { kind: "generate" } | { kind: "status"; row: CoachRecord; action: "complete" | "dismiss" };
/** Mounted only with confirmed membership and keyed by user/workspace. No legacy Brain realtime/AI. */
export function useCoachWorkspace(workspaceId: string, userId: string, canEdit: boolean) {
  const qc = useQueryClient();
  const list = useServerFn(listRecommendations),
    journey = useServerFn(listJourney);
  const generate = useServerFn(generateRecommendations),
    update = useServerFn(updateRecommendation);
  const [browse, setBrowse] = useState<CoachBrowse>({ status: "open", page: 1 });
  const [journeyPage, setJourneyPage] = useState(1);
  const query = useQuery({
    queryKey: coachQueryKey(workspaceId, userId, "recommendations", browse.page, browse.status),
    queryFn: async () => {
      const input = { workspaceId, ...browse };
      return confirmCoachPage(await list({ data: input }), input);
    },
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const timeline = useQuery({
    queryKey: coachQueryKey(workspaceId, userId, "journey", journeyPage),
    queryFn: async () => {
      const input = { workspaceId, page: journeyPage };
      return confirmJourneyPage(await journey({ data: input }), input);
    },
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const scope = JSON.stringify([workspaceId, userId]);
  const operation = useSyncExternalStore(
    (callback) => coachOperations.subscribe(scope, callback),
    () => coachOperations.snapshot(scope),
    coachOperations.serverSnapshot,
  );
  const [reading, setReading] = useState<"recommendations" | "journey" | null>(null);
  const [proposal, setProposal] = useState<CoachProposal | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const mounted = useRef(false),
    lockedRead = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const busy = operation.pending !== null || reading !== null;
  const readReady = query.data !== undefined && !query.isError && !query.isFetching;
  const canWrite = canEdit && !busy && !operation.review && readReady;
  const invalidateScope = () => {
    void qc.invalidateQueries({
      queryKey: coachQueryRoot(workspaceId, userId),
      refetchType: "none",
    });
    for (const module of ["dashboard-recommendations", "dashboard-journey"])
      void qc.invalidateQueries({ queryKey: [module, workspaceId, userId], refetchType: "none" });
  };
  const read = async (panel: "recommendations" | "journey") => {
    try {
      const result = await (panel === "recommendations" ? query : timeline).refetch({
        cancelRefetch: false,
      });
      return !result.isError && result.data !== undefined;
    } catch {
      return false;
    }
  };
  const cancelProposal = () => {
    setProposal(null);
    setAcknowledged(false);
  };
  const prepareGenerate = () => {
    if (!canWrite) return;
    setProposal({ kind: "generate" });
    setAcknowledged(false);
  };
  const prepareStatus = (row: CoachRecord, action: "complete" | "dismiss") => {
    if (
      !canWrite ||
      coachState(row) !== "open" ||
      !query.data?.items.some(
        (item) =>
          item.id === row.id && item.updated_at === row.updated_at && coachState(item) === "open",
      )
    )
      return;
    setProposal({ kind: "status", row, action });
    setAcknowledged(false);
  };
  const confirmProposal = async () => {
    if (lockedRead.current || !canWrite || !proposal || !acknowledged) return;
    if (
      proposal.kind === "status" &&
      !query.data?.items.some(
        (row) =>
          row.id === proposal.row.id &&
          row.updated_at === proposal.row.updated_at &&
          coachState(row) === "open",
      )
    ) {
      cancelProposal();
      return;
    }
    if (!coachOperations.begin(scope, proposal.kind)) return;
    const decision = proposal;
    cancelProposal();
    let reference: string | undefined;
    try {
      let feedback: CoachFeedback;
      if (decision.kind === "generate") {
        const input = { workspaceId, batchId: crypto.randomUUID() };
        reference = input.batchId;
        const receipt = confirmCoachGeneration(await generate({ data: input }), input, userId);
        feedback = {
          kind: "generated",
          generated: receipt.generated,
          reference,
          eventMissing: !receipt.eventRecorded,
        };
      } else {
        const input = {
          workspaceId,
          id: decision.row.id,
          expectedUpdatedAt: decision.row.updated_at,
          action: decision.action,
        };
        reference = input.id;
        confirmCoachStatus(await update({ data: input }), input);
        feedback = { kind: "statusSaved", reference };
      }
      invalidateScope();
      if (!mounted.current) {
        coachOperations.finish(scope, { ...feedback, readFailed: true });
        return;
      }
      const fresh = await read("recommendations");
      const journeyFresh =
        decision.kind === "generate" && mounted.current ? await read("journey") : true;
      coachOperations.finish(scope, {
        ...feedback,
        readFailed: !fresh,
        journeyReadFailed: !journeyFresh,
      });
    } catch {
      invalidateScope();
      coachOperations.finish(scope, { kind: "unconfirmed", reference });
      if (mounted.current) setReviewConfirmed(false);
    }
  };
  const refresh = async (panel: "recommendations" | "journey") => {
    if (
      lockedRead.current ||
      coachOperations.snapshot(scope).pending ||
      busy ||
      (panel === "recommendations" ? query : timeline).isFetching
    )
      return;
    lockedRead.current = true;
    setReading(panel);
    if (panel === "recommendations") {
      cancelProposal();
      setReviewConfirmed(false);
    }
    try {
      const confirmed = await read(panel);
      if (mounted.current) {
        if (panel === "recommendations") coachOperations.afterRead(scope, confirmed);
        else coachOperations.afterJourneyRead(scope, confirmed);
      }
    } finally {
      lockedRead.current = false;
      if (mounted.current) setReading(null);
    }
  };
  const changeBrowse = (next: CoachBrowse) => {
    if (lockedRead.current || coachOperations.snapshot(scope).pending || busy || query.isFetching)
      return;
    const parsed = coachBrowseSchema.safeParse(next);
    if (!parsed.success) return;
    cancelProposal();
    setReviewConfirmed(false);
    coachOperations.browseChanged(scope);
    setBrowse(parsed.data);
  };
  const setFilter = (status: CoachFilter) => changeBrowse({ status, page: 1 });
  const setPage = (page: number) => changeBrowse({ ...browse, page });
  const setTimelinePage = (page: number) => {
    if (busy || timeline.isFetching || lockedRead.current) return;
    const parsed = journeyListInputSchema.safeParse({ workspaceId, page });
    if (parsed.success) setJourneyPage(parsed.data.page);
  };
  const resume = () => {
    if (!canEdit || busy || lockedRead.current) return;
    if (coachOperations.resume(scope, reviewConfirmed, readReady)) setReviewConfirmed(false);
  };
  return {
    query,
    timeline,
    browse,
    journeyPage,
    setFilter,
    setPage,
    setTimelinePage,
    operation,
    reading,
    busy,
    canWrite,
    proposal,
    acknowledged,
    setAcknowledged,
    prepareGenerate,
    prepareStatus,
    cancelProposal,
    confirmProposal,
    refresh,
    reviewConfirmed,
    setReviewConfirmed,
    resume,
  };
}
