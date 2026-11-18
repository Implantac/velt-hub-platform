import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { AuthErrorTranslationKey } from "@/lib/auth/auth-error-message";

export function AuthError({ error }: { error: AuthErrorTranslationKey | null }) {
  const { t } = useTranslation();
  const region = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) region.current?.focus();
  }, [error]);
  if (!error) return null;
  return (
    <p
      ref={region}
      id="auth-form-error"
      role="alert"
      tabIndex={-1}
      className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground outline-offset-4"
    >
      {t(error)}
    </p>
  );
}

export function EmailCooldown({ seconds }: { seconds: number }) {
  const { t } = useTranslation();
  if (!seconds) return null;
  // Do not make screen readers announce a live countdown every second.
  return (
    <p id="auth-email-cooldown" aria-live="off" className="text-sm text-muted-foreground">
      {t("auth.emailCooldown", { count: seconds })}
    </p>
  );
}
