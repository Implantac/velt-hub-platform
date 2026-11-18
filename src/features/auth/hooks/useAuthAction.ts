import { useCallback, useEffect, useRef, useState } from "react";
import {
  authErrorTranslationKey,
  type AuthErrorTranslationKey,
} from "@/lib/auth/auth-error-message";

/** One in-flight action, including the gap before React commits disabled controls. */
export function useAuthAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorTranslationKey | null>(null);
  const lifetime = useRef({ mounted: false, locked: false, generation: 0 });

  useEffect(() => {
    const scope = lifetime.current;
    scope.mounted = true;
    return () => {
      scope.mounted = false;
      scope.generation++;
      scope.locked = false;
    };
  }, []);

  const run = useCallback(async (action: (isCurrent: () => boolean) => Promise<void>) => {
    const scope = lifetime.current;
    if (scope.locked || !scope.mounted) return;
    scope.locked = true;
    const current = ++scope.generation;
    const isCurrent = () => scope.mounted && scope.generation === current;
    setBusy(true);
    setError(null);
    try {
      await action(isCurrent);
    } catch (error) {
      if (isCurrent()) setError(authErrorTranslationKey(error));
    } finally {
      if (isCurrent()) {
        scope.locked = false;
        setBusy(false);
      }
    }
  }, []);

  return { busy, error, setError, run };
}
