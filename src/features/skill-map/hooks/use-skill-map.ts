import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getSkillMap, saveSkillAssessment } from "@/lib/api/skill-map.functions";
import {
  confirmSkillReceipt,
  confirmSkillSnapshot,
  skillAssessmentEqual,
  skillAssessmentFor,
  type SkillArea,
  type SkillReceipt,
} from "@/lib/skill-map/contracts";
import { skillAccountRequest } from "../account-guard";
import { skillOperations } from "../operation-store";
import {
  skillDraftSchema,
  skillEditor,
  skillEditorMatches,
  skillNeedsSave,
  skillOperationScope,
  skillQueryKey,
  skillViewKey,
  type SkillView,
} from "../presentation";

const initialView: SkillView = { editor: null, receipt: null };
/** Personal records within a confirmed workspace, with no network/persistence attached to the draft query. */
export function useSkillMap(userId: string, workspaceId: string) {
  const qc = useQueryClient(),
    get = useServerFn(getSkillMap),
    record = useServerFn(saveSkillAssessment);
  const inputScope = { accountId: userId, workspaceId },
    scope = skillOperationScope(userId, workspaceId);
  const forAccount = <T>(call: () => Promise<T>) =>
    skillAccountRequest(userId, () => supabase.auth.getSession(), call);
  const options = {
    queryKey: skillQueryKey(userId, workspaceId),
    queryFn: async () =>
      confirmSkillSnapshot(await forAccount(() => get({ data: inputScope })), inputScope, userId),
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  };
  const query = useQuery(options);
  const viewQuery = useQuery<SkillView>({
    queryKey: skillViewKey(userId, workspaceId),
    queryFn: async () => initialView,
    enabled: false,
    initialData: initialView,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
  });
  const view = viewQuery.data ?? initialView;
  const setView = (update: (current: SkillView) => SkillView) =>
    qc.setQueryData<SkillView>(skillViewKey(userId, workspaceId), (current) =>
      update(current ?? initialView),
    );
  const operation = useSyncExternalStore(
    (listener) => skillOperations.subscribe(scope, listener),
    () => skillOperations.snapshot(scope),
    skillOperations.serverSnapshot,
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
  const busy = operation.pending || operation.reading,
    readReady = query.data !== undefined && !query.isError && !query.isFetching;
  const readToken = readReady && !busy ? `${query.dataUpdatedAt}:${query.errorUpdatedAt}` : null;
  const acknowledged = readToken !== null && saveAck === readToken,
    reviewConfirmed = readToken !== null && reviewAck === readToken;
  const editor = view.editor,
    matches = !!editor && skillEditorMatches(editor, query.data);
  const parsed = editor
    ? skillDraftSchema.safeParse({ score: editor.score, notes: editor.notes })
    : null;
  const needsSave = !!(editor && parsed?.success && skillNeedsSave(editor, parsed.data));
  const canChoose = readReady && !busy && !operation.review && !editor;
  const canReview =
    !!editor && !!parsed?.success && matches && readReady && !busy && !operation.review;
  const canSave = canReview && editor?.step === "review" && acknowledged && needsSave;
  const resetAcks = () => {
    setSaveAck(null);
    setReviewAck(null);
  };
  const invalidate = () => {
    void qc.invalidateQueries({
      queryKey: skillQueryKey(userId, workspaceId),
      refetchType: "none",
    });
    void qc.invalidateQueries({
      queryKey: ["dashboard-skills", workspaceId, userId],
      refetchType: "none",
    });
  };
  const read = async (receipt?: SkillReceipt) => {
    try {
      const snapshot = await qc.fetchQuery(options);
      return (
        mounted.current &&
        (!receipt ||
          skillAssessmentEqual(skillAssessmentFor(snapshot, receipt.area), receipt.assessment))
      );
    } catch {
      return false;
    }
  };
  const refresh = async () => {
    if (query.isFetching || !skillOperations.startRead(scope)) return;
    resetAcks();
    const fresh = await read();
    if (fresh) setView((current) => ({ ...current, receipt: null }));
    skillOperations.endRead(scope, fresh);
  };
  const choose = (area: SkillArea) => {
    const current = skillOperations.snapshot(scope);
    if (!canChoose || current.pending || current.reading || current.review || !query.data) return;
    setView((previous) => ({
      ...previous,
      receipt: null,
      editor: skillEditor(area, skillAssessmentFor(query.data!, area)),
    }));
    resetAcks();
  };
  const changeDraft = (score: string, notes: string) => {
    const current = skillOperations.snapshot(scope);
    if (current.pending || current.reading || current.review) return;
    setView((previous) => ({
      ...previous,
      editor: previous.editor ? { ...previous.editor, score, notes, step: "edit" } : null,
    }));
    resetAcks();
  };
  const setStep = (step: "edit" | "review") => {
    const current = skillOperations.snapshot(scope);
    if (current.pending || current.reading || current.review || (step === "review" && !canReview))
      return;
    setView((previous) => ({
      ...previous,
      editor: previous.editor ? { ...previous.editor, step } : null,
    }));
    resetAcks();
  };
  const cancel = () => {
    const current = skillOperations.snapshot(scope);
    if (current.pending || current.reading || current.review) return;
    setView((previous) => ({ ...previous, editor: null }));
    resetAcks();
  };
  const loadLatest = () => {
    const current = skillOperations.snapshot(scope);
    if (
      !editor ||
      !query.data ||
      !readReady ||
      current.pending ||
      current.reading ||
      current.review
    )
      return;
    setView((previous) => ({
      ...previous,
      editor: skillEditor(editor.area, skillAssessmentFor(query.data!, editor.area)),
    }));
    resetAcks();
  };
  const save = async () => {
    if (!canSave || !editor || !parsed?.success) return;
    const reference = crypto.randomUUID();
    if (!skillOperations.begin(scope, reference)) return;
    const input = {
      ...inputScope,
      area: editor.area,
      score: parsed.data.score,
      notes: parsed.data.notes,
      expected: editor.expected,
      operationId: reference,
    };
    let receipt: SkillReceipt;
    try {
      receipt = confirmSkillReceipt(await forAccount(() => record({ data: input })), input, userId);
    } catch {
      invalidate();
      skillOperations.finish(scope, reference, {
        kind: "unconfirmed",
        reference,
        readFailed: true,
      });
      if (mounted.current) resetAcks();
      return;
    }
    // Primary receipt stays successful even if following GET is unavailable or the old screen unmounted.
    invalidate();
    setView((current) => ({ ...current, editor: null, receipt }));
    if (mounted.current) resetAcks();
    const fresh = mounted.current ? await read(receipt) : false;
    if (fresh) setView((current) => ({ ...current, receipt: null }));
    skillOperations.finish(scope, reference, {
      kind: receipt.mode === "unchanged" ? "unchanged" : "saved",
      reference,
      readFailed: !fresh,
    });
  };
  const resume = () => {
    if (!skillOperations.resume(scope, reviewConfirmed, readReady)) return;
    // A valid read + human acknowledgement abandons the old draft. Never replay or silently rebase it.
    setView((current) => ({ ...current, editor: null }));
    resetAcks();
  };
  return {
    query,
    view,
    editor,
    operation,
    busy,
    readReady,
    matches,
    parsed,
    needsSave,
    canChoose,
    canReview,
    canSave,
    acknowledged,
    reviewConfirmed,
    setAcknowledged: (value: boolean) => setSaveAck(value ? readToken : null),
    setReviewConfirmed: (value: boolean) => setReviewAck(value ? readToken : null),
    refresh,
    choose,
    changeDraft,
    setStep,
    cancel,
    loadLatest,
    save,
    resume,
  };
}
