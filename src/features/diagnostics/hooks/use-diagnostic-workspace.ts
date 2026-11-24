import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { computeHealth, getLatestHealth } from "@/lib/api/health.functions";
import { computeDigitalScore, getLatestScore } from "@/lib/api/score.functions";
import {
  confirmDiagnosticRead,
  confirmHealthReceipt,
  confirmScoreReceipt,
  type DiagnosticKind,
} from "@/lib/diagnostics/contracts";
import {
  diagnosticQueryKey,
  diagnosticQueryRoot,
  feedbackAfterDiagnosticRead,
  type DiagnosticFeedback,
} from "../presentation";

/** Mount only after membership is known, keyed by module/user/workspace. */
export function useDiagnosticWorkspace(
  kind: DiagnosticKind,
  workspaceId: string,
  userId: string,
  canEdit: boolean,
) {
  const qc = useQueryClient();
  const getHealth = useServerFn(getLatestHealth);
  const getScore = useServerFn(getLatestScore);
  const calculateHealth = useServerFn(computeHealth);
  const calculateScore = useServerFn(computeDigitalScore);
  const query = useQuery({
    queryKey: diagnosticQueryKey(kind, workspaceId, userId),
    queryFn: async () => {
      const input = { data: { workspaceId } };
      const value = kind === "health" ? await getHealth(input) : await getScore(input);
      return confirmDiagnosticRead(kind, value, workspaceId);
    },
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const [pending, setPending] = useState<"compute" | "refresh" | null>(null);
  const [feedback, setFeedback] = useState<DiagnosticFeedback | null>(null);
  const [review, setReview] = useState<{ refreshed: boolean } | null>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const canCompute =
    canEdit &&
    !pending &&
    !review &&
    query.data !== undefined &&
    !query.isError &&
    !query.isFetching;
  const invalidateScope = () => {
    void qc.invalidateQueries({
      queryKey: diagnosticQueryRoot(workspaceId, userId),
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
  const compute = async () => {
    if (locked.current || !canCompute) return;
    locked.current = true;
    setPending("compute");
    setFeedback(null);
    const input = { workspaceId, calculationId: crypto.randomUUID() };
    try {
      let confirmed: DiagnosticFeedback;
      if (kind === "health") {
        confirmHealthReceipt(await calculateHealth({ data: input }), input);
        confirmed = { kind: "saved" };
      } else {
        const receipt = confirmScoreReceipt(await calculateScore({ data: input }), input);
        confirmed = {
          kind: "saved",
          snapshotMissing: !receipt.snapshotRecorded,
          answersStale: !receipt.answersInvalidated,
        };
      }
      invalidateScope();
      if (!mounted.current) return;
      const fresh = await read();
      if (mounted.current) setFeedback({ ...confirmed, readFailed: !fresh });
    } catch {
      invalidateScope();
      if (mounted.current) {
        setFeedback({ kind: "unconfirmed" });
        setReview({ refreshed: false });
        setReviewConfirmed(false);
      }
    } finally {
      locked.current = false;
      if (mounted.current) setPending(null);
    }
  };
  const refresh = async () => {
    if (locked.current || query.isFetching) return;
    locked.current = true;
    setPending("refresh");
    setReviewConfirmed(false);
    try {
      const fresh = await read();
      if (mounted.current) {
        setReview((current) => (current ? { refreshed: fresh } : null));
        setFeedback((current) => feedbackAfterDiagnosticRead(current, fresh));
      }
    } finally {
      locked.current = false;
      if (mounted.current) setPending(null);
    }
  };
  const resume = () => {
    if (
      locked.current ||
      !review?.refreshed ||
      !reviewConfirmed ||
      query.isError ||
      query.isFetching ||
      query.data === undefined
    )
      return;
    // Acknowledgement unlocks a future decision; it does not repeat any POST.
    setReview(null);
    setReviewConfirmed(false);
    setFeedback(null);
  };
  return {
    query,
    pending,
    feedback,
    review,
    reviewConfirmed,
    setReviewConfirmed,
    canCompute,
    compute,
    refresh,
    resume,
  };
}
