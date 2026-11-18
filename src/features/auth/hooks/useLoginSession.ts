import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  cleanLoginCallbackPath,
  createRecoverySession,
  loginCallbackIntent,
  type RecoveryState,
} from "@/lib/auth/recovery-session";

export function useLoginSession(recoveryRequested: boolean, onAuthenticated: () => void) {
  const [state, setState] = useState<RecoveryState>({
    status: recoveryRequested ? "checking" : "idle",
  });
  const controller = useRef<ReturnType<typeof createRecoverySession> | null>(null);
  const initializationFailed = useRef(false);

  useEffect(() => {
    const intent = loginCallbackIntent(window.location.search, window.location.hash);
    setState({ status: intent.recovery ? "checking" : "idle" });
    initializationFailed.current = false;
    const current = createRecoverySession(intent, {
      getUser: async () => {
        // getUser() alone can hide a failed URL exchange behind "session missing".
        const { error } = await supabase.auth.initialize();
        if (error) {
          initializationFailed.current = true;
          return { data: { user: null }, error, initializationError: true };
        }
        return supabase.auth.getUser();
      },
      onChange: setState,
      onAuthenticated,
      onCallbackSettled: (settledIntent) => {
        try {
          const clean = cleanLoginCallbackPath(window.location.href, settledIntent);
          if (clean) window.history.replaceState(window.history.state, "", clean);
        } catch {
          // Privacy restrictions must not turn a read-only check into a crash.
        }
      },
    });
    controller.current = current;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      current.onAuthEvent(event, session?.user ?? null);
    });
    void current.check();
    return () => {
      current.dispose();
      controller.current = null;
      subscription.unsubscribe();
    };
  }, [recoveryRequested, onAuthenticated]);

  const retry = useCallback(() => {
    // SDK initialization is cached. A transient callback failure needs a fresh
    // initialization, not a manual token exchange or a loop over the same error.
    if (initializationFailed.current) window.location.reload();
    else void controller.current?.check();
  }, []);
  const validateForUpdate = useCallback(async (userId: string) => {
    const current = controller.current;
    if (!current?.isCurrentUser(userId)) return false;
    await current.check();
    return current === controller.current && current.isCurrentUser(userId);
  }, []);
  const isCurrentUser = useCallback(
    (userId: string) => controller.current?.isCurrentUser(userId) ?? false,
    [],
  );
  const invalidate = useCallback(() => controller.current?.invalidate(), []);
  return { state, retry, validateForUpdate, isCurrentUser, invalidate };
}
