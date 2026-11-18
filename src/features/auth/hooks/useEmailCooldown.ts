import { useCallback, useEffect, useState } from "react";
import {
  EMAIL_RETRY_DELAY_MS,
  emailRetrySeconds,
  savedEmailDeadline,
} from "@/lib/auth/email-actions";

const STORAGE_KEY = "velt:auth-email-retry-until";

/** No email, password or token is stored. This is feedback, not an abuse barrier. */
export function useEmailCooldown() {
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const current = Date.now();
    setNow(current);
    try {
      setDeadline(savedEmailDeadline(window.sessionStorage.getItem(STORAGE_KEY), current));
    } catch {
      // Authentication remains usable with browser storage disabled.
    }
  }, []);

  useEffect(() => {
    if (!deadline) return;
    const interval = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline) {
        setDeadline(0);
        window.clearInterval(interval);
      }
    }, 500);
    return () => window.clearInterval(interval);
  }, [deadline]);

  const start = useCallback(() => {
    const current = Date.now();
    const next = current + EMAIL_RETRY_DELAY_MS;
    setNow(current);
    setDeadline(next);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // The in-memory delay still applies for this mounted page.
    }
  }, []);

  return { seconds: deadline ? emailRetrySeconds(deadline, now) : 0, start };
}
