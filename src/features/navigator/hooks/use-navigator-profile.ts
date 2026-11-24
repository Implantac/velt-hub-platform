import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDigitalProfile, saveDigitalProfile } from "@/lib/api/navigator.functions";
import {
  confirmNavigatorProfile,
  confirmNavigatorReceipt,
  type NavigatorRecord,
} from "@/lib/navigator/contracts";
import {
  navigatorDraft,
  navigatorDraftKey,
  navigatorDraftSchema,
  navigatorNeedsSave,
  navigatorQueryKey,
  navigatorVersion,
  type NavigatorDraft,
} from "../presentation";
import { navigatorOperations } from "../operation-store";

type Editor = { draft: NavigatorDraft; baseUpdatedAt: string | null; step: number };
/** Personal profile: scope is the authenticated account, deliberately not workspace or role. */
export function useNavigatorProfile(userId: string) {
  const qc = useQueryClient(),
    get = useServerFn(getDigitalProfile),
    saveProfile = useServerFn(saveDigitalProfile);
  const query = useQuery({
    queryKey: navigatorQueryKey(userId),
    queryFn: async () => confirmNavigatorProfile(await get(), userId),
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const operation = useSyncExternalStore(
    (listener) => navigatorOperations.subscribe(userId, listener),
    () => navigatorOperations.snapshot(userId),
    navigatorOperations.serverSnapshot,
  );
  // The existing shell remounts its outlet on a workspace switch. Keep the draft
  // in account-keyed, nonpersistent client memory rather than losing/resetting it.
  // enabled:false means this local cache can never issue an endpoint request.
  const draftQuery = useQuery<Editor | null>({
    queryKey: navigatorDraftKey(userId),
    queryFn: async () => null,
    enabled: false,
    initialData: null,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
  });
  const editor = draftQuery.data ?? null;
  const setEditor = (next: Editor | null | ((current: Editor | null) => Editor | null)) =>
    qc.setQueryData<Editor | null>(navigatorDraftKey(userId), (current) =>
      typeof next === "function" ? next(current ?? null) : next,
    );
  const [saveAck, setSaveAck] = useState<string | null>(null),
    [reviewAck, setReviewAck] = useState<string | null>(null),
    [rebaseAck, setRebaseAck] = useState<string | null>(null),
    [reading, setReading] = useState(false),
    [lastConfirmed, setLastConfirmed] = useState<NavigatorRecord | null>(null);
  const mounted = useRef(false),
    readLock = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const readReady = query.data !== undefined && !query.isError && !query.isFetching;
  // A human acknowledgement applies only to the read they saw, not a later refetch/version.
  const readToken = readReady
    ? `${query.dataUpdatedAt}:${query.errorUpdatedAt}:${navigatorVersion(query.data!)}`
    : null;
  const acknowledged = readToken !== null && saveAck === readToken,
    reviewConfirmed = readToken !== null && reviewAck === readToken,
    rebaseConfirmed = readToken !== null && rebaseAck === readToken;
  const setAcknowledged = (value: boolean) => setSaveAck(value ? readToken : null),
    setReviewConfirmed = (value: boolean) => setReviewAck(value ? readToken : null),
    setRebaseConfirmed = (value: boolean) => setRebaseAck(value ? readToken : null);
  const busy = operation.pending || reading;
  const versionMatches =
    editor && query.data !== undefined
      ? editor.baseUpdatedAt === navigatorVersion(query.data)
      : false;
  const parsed = editor ? navigatorDraftSchema.safeParse(editor.draft) : null;
  const needsSave = !!(
    parsed?.success &&
    query.data !== undefined &&
    navigatorNeedsSave(parsed.data, query.data)
  );
  const canSave =
    !!editor &&
    editor.step === 6 &&
    !!parsed?.success &&
    needsSave &&
    !!versionMatches &&
    acknowledged &&
    readReady &&
    !busy &&
    !operation.review;
  const profile =
    lastConfirmed && (query.isError || query.isFetching || query.data === undefined)
      ? lastConfirmed
      : query.data;
  const read = async () => {
    try {
      const result = await query.refetch({ cancelRefetch: false });
      if (!result.isError && result.data !== undefined) {
        if (mounted.current) setLastConfirmed(null);
        return true;
      }
    } catch {
      /* Unavailable read is not absence. */
    }
    return false;
  };
  const resetAcknowledgements = () => {
    setSaveAck(null);
    setReviewAck(null);
    setRebaseAck(null);
  };
  const start = () => {
    if (
      !readReady ||
      busy ||
      readLock.current ||
      navigatorOperations.snapshot(userId).review ||
      navigatorOperations.snapshot(userId).pending
    )
      return;
    setEditor({
      draft: navigatorDraft(query.data!),
      baseUpdatedAt: navigatorVersion(query.data!),
      step: 1,
    });
    resetAcknowledgements();
  };
  const cancel = () => {
    if (navigatorOperations.snapshot(userId).pending) return;
    setEditor(null);
    resetAcknowledgements();
  };
  const changeDraft = (draft: NavigatorDraft) => {
    if (navigatorOperations.snapshot(userId).pending) return;
    setEditor((current) => (current ? { ...current, draft } : null));
    setSaveAck(null);
    setRebaseAck(null);
  };
  const setStep = (step: number) => {
    if (busy || !Number.isInteger(step) || step < 1 || step > 6) return;
    setEditor((current) => (current ? { ...current, step } : null));
    setSaveAck(null);
  };
  const refresh = async () => {
    if (readLock.current || navigatorOperations.snapshot(userId).pending || query.isFetching)
      return;
    readLock.current = true;
    setReading(true);
    resetAcknowledgements();
    try {
      const fresh = await read();
      if (mounted.current) navigatorOperations.afterRead(userId, fresh);
    } finally {
      readLock.current = false;
      if (mounted.current) setReading(false);
    }
  };
  const save = async () => {
    if (
      readLock.current ||
      !canSave ||
      !editor ||
      !parsed?.success ||
      !navigatorOperations.begin(userId)
    )
      return;
    let reference: string | undefined;
    try {
      const input = {
        answers: parsed.data,
        expectedUpdatedAt: editor.baseUpdatedAt,
        revisionId: crypto.randomUUID(),
      };
      reference = input.revisionId;
      const receipt = confirmNavigatorReceipt(await saveProfile({ data: input }), input, userId);
      void qc.invalidateQueries({ queryKey: navigatorQueryKey(userId), refetchType: "none" });
      // Clear the saved draft even if the personal screen was remounted meanwhile.
      setEditor(null);
      if (!mounted.current) {
        navigatorOperations.finish(userId, {
          kind: "saved",
          reference,
          mode: receipt.mode,
          readFailed: true,
        });
        return;
      }
      setLastConfirmed(receipt.profile);
      resetAcknowledgements();
      const fresh = await read();
      navigatorOperations.finish(userId, {
        kind: "saved",
        reference,
        mode: receipt.mode,
        readFailed: !fresh,
      });
    } catch {
      void qc.invalidateQueries({ queryKey: navigatorQueryKey(userId), refetchType: "none" });
      navigatorOperations.finish(userId, { kind: "unconfirmed", reference });
      if (mounted.current) resetAcknowledgements();
    }
  };
  const resume = () => {
    if (busy || readLock.current) return;
    if (navigatorOperations.resume(userId, reviewConfirmed, readReady)) setReviewAck(null);
  };
  const loadLatest = () => {
    if (!editor || !readReady || busy || readLock.current) return;
    setEditor({
      draft: navigatorDraft(query.data!),
      baseUpdatedAt: navigatorVersion(query.data!),
      step: 1,
    });
    resetAcknowledgements();
  };
  const adoptLatest = () => {
    if (
      !editor ||
      !readReady ||
      busy ||
      readLock.current ||
      navigatorOperations.snapshot(userId).review ||
      !rebaseConfirmed
    )
      return;
    setEditor({ ...editor, baseUpdatedAt: navigatorVersion(query.data!), step: 6 });
    resetAcknowledgements();
  };
  return {
    query,
    profile,
    operation,
    editor,
    acknowledged,
    setAcknowledged,
    reviewConfirmed,
    setReviewConfirmed,
    rebaseConfirmed,
    setRebaseConfirmed,
    reading,
    readReady,
    busy,
    versionMatches,
    parsed,
    needsSave,
    canSave,
    start,
    cancel,
    changeDraft,
    setStep,
    refresh,
    save,
    resume,
    loadLatest,
    adoptLatest,
  };
}
