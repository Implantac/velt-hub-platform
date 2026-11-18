import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { FEATURES } from "@/lib/features/flags";
import { authErrorTranslationKey } from "@/lib/auth/auth-error-message";
import { authEmailRedirect } from "@/lib/auth/email-actions";
import { useAuthAction } from "../hooks/useAuthAction";
import { useEmailCooldown } from "../hooks/useEmailCooldown";
import { useLoginSession } from "../hooks/useLoginSession";
import { AuthFrame, authInputClass, authPrimaryClass, authSecondaryClass } from "./AuthFrame";
import { AuthError, EmailCooldown } from "./AuthFeedback";
import { PasswordField } from "./PasswordField";
import { GoogleSignIn } from "./GoogleSignIn";

type Props = { returnTo: string; recoveryRequested: boolean; onAuthenticated: () => void };

export function LoginPage({ returnTo, recoveryRequested, onAuthenticated }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"login" | "request">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [noticeEmail, setNoticeEmail] = useState<string | null>(null);
  const action = useAuthAction();
  const cooldown = useEmailCooldown();
  const recovery = useLoginSession(recoveryRequested, onAuthenticated);
  const recovering = mode !== "request" && recovery.state.status !== "idle";
  const backHref = `/login?${new URLSearchParams({ redirect: returnTo })}`;
  const describedBy = action.error ? "auth-form-error" : undefined;

  function requestMode() {
    setMode("request");
    action.setError(null);
    setNoticeEmail(null);
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  function handleEmail(event: FormEvent) {
    event.preventDefault();
    void action.run(async (isCurrent) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (!isCurrent()) return;
      if (error) action.setError(authErrorTranslationKey(error));
      else if (data.session?.user) onAuthenticated();
      else action.setError("auth.authUnavailable");
    });
  }

  function handleReset(event: FormEvent) {
    event.preventDefault();
    if (cooldown.seconds) return;
    const submittedEmail = email.trim();
    void action.run(async (isCurrent) => {
      setNoticeEmail(null);
      const { error } = await supabase.auth.resetPasswordForEmail(submittedEmail, {
        redirectTo: authEmailRedirect(window.location.origin, "recovery"),
      });
      if (!isCurrent()) return;
      if (error) {
        const key = authErrorTranslationKey(error);
        if (key === "auth.tooManyAttempts") cooldown.start();
        action.setError(key === "auth.authUnavailable" ? "auth.resetEmailFailed" : key);
      } else {
        setNoticeEmail(submittedEmail);
        cooldown.start();
      }
    });
  }

  function handleUpdate(event: FormEvent) {
    event.preventDefault();
    if (recovery.state.status !== "ready") return;
    if (newPassword !== confirmPassword) {
      action.setError("auth.passwordMismatch");
      return;
    }
    if (newPassword.length < 8) {
      action.setError("auth.weakPassword");
      return;
    }
    const userId = recovery.state.user.id;
    void action.run(async (isCurrent) => {
      const verified = await recovery.validateForUpdate(userId);
      if (!isCurrent() || !verified) return;
      const { data, error } = await supabase.auth.updateUser({ password: newPassword });
      if (!isCurrent() || !recovery.isCurrentUser(userId)) return;
      if (error) {
        const key = authErrorTranslationKey(error);
        if (key === "auth.sessionExpired") recovery.invalidate();
        else action.setError(key);
      } else if (data.user?.id === userId) {
        setNewPassword("");
        setConfirmPassword("");
        toast.success(t("auth.passwordUpdated"));
        onAuthenticated();
      } else {
        recovery.invalidate();
      }
    });
  }

  function handleGoogle() {
    void action.run(async (isCurrent) => {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (isCurrent() && result.error) action.setError("auth.authUnavailable");
    });
  }

  return (
    <AuthFrame
      headingId="login-heading"
      title={t(
        recovering
          ? "auth.resetPasswordTitle"
          : mode === "request"
            ? "auth.forgotPassword"
            : "auth.loginTitle",
      )}
      subtitle={t(
        recovering
          ? "auth.newPasswordInstructions"
          : mode === "request"
            ? "auth.resetInstructions"
            : "auth.loginSubtitle",
      )}
    >
      {recovering ? (
        <div className="space-y-4">
          {recovery.state.status === "checking" && (
            <p
              role="status"
              className="rounded-xl border border-border bg-secondary/40 p-4 text-sm"
            >
              {t("auth.checkingRecovery")}
            </p>
          )}
          {(recovery.state.status === "invalid" || recovery.state.status === "unavailable") && (
            <>
              <p
                role="alert"
                className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
              >
                {t(
                  recovery.state.status === "invalid"
                    ? "auth.recoveryInvalid"
                    : "auth.recoveryUnavailable",
                )}
              </p>
              {recovery.state.status === "unavailable" && (
                <button type="button" onClick={recovery.retry} className={authPrimaryClass}>
                  {t("common.tryAgain")}
                </button>
              )}
              <button
                type="button"
                onClick={requestMode}
                className={
                  recovery.state.status === "invalid" ? authPrimaryClass : authSecondaryClass
                }
              >
                {t("auth.requestNewLink")}
              </button>
            </>
          )}
          {recovery.state.status === "ready" && (
            <form onSubmit={handleUpdate} aria-busy={action.busy} className="space-y-4">
              <p className="break-words rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
                {recovery.state.user.email
                  ? t("auth.recoveryAccount", { email: recovery.state.user.email })
                  : t("auth.recoverySessionConfirmed")}
              </p>
              <AuthError error={action.error} />
              <fieldset disabled={action.busy} className="min-w-0 space-y-4">
                <legend className="sr-only">{t("auth.resetPasswordTitle")}</legend>
                <PasswordField
                  id="new-password"
                  name="new-password"
                  label={t("auth.newPassword")}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder={t("auth.passwordPlaceholder")}
                  aria-describedby={describedBy}
                />
                <PasswordField
                  id="confirm-password"
                  name="confirm-password"
                  label={t("auth.confirmPassword")}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder={t("auth.passwordPlaceholder")}
                  aria-describedby={describedBy}
                />
                <button type="submit" className={authPrimaryClass}>
                  {t(action.busy ? "auth.updatingPassword" : "auth.resetPasswordTitle")}
                </button>
              </fieldset>
            </form>
          )}
          {!action.busy && (
            <a href={backHref} className={authSecondaryClass}>
              {t("auth.backToLogin")}
            </a>
          )}
        </div>
      ) : (
        <>
          {mode === "login" && FEATURES.googleAuth && (
            <GoogleSignIn onClick={handleGoogle} disabled={action.busy} />
          )}
          <form
            onSubmit={mode === "request" ? handleReset : handleEmail}
            aria-busy={action.busy}
            className="space-y-4"
          >
            <AuthError error={action.error} />
            {mode === "request" && noticeEmail && (
              <p
                role="status"
                className="break-words rounded-xl border border-success/30 bg-success/10 p-3 text-sm"
              >
                {t("auth.resetEmailAccepted", { email: noticeEmail })}
              </p>
            )}
            <fieldset disabled={action.busy} className="min-w-0 space-y-4">
              <legend className="sr-only">
                {t(mode === "request" ? "auth.forgotPassword" : "auth.loginTitle")}
              </legend>
              <div className="space-y-1.5">
                <label
                  htmlFor="login-email"
                  className="ml-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  {t("common.email")}
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t("auth.emailPlaceholder")}
                  className={authInputClass}
                  aria-describedby={describedBy}
                />
              </div>
              {mode === "login" ? (
                <>
                  <PasswordField
                    id="login-password"
                    name="password"
                    label={t("common.password")}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    aria-describedby={describedBy}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={requestMode}
                      className="min-h-11 text-sm font-medium text-primary hover:underline"
                    >
                      {t("auth.forgotPassword")}
                    </button>
                  </div>
                  <button type="submit" className={authPrimaryClass}>
                    {t(action.busy ? "auth.signingIn" : "common.signIn")}
                  </button>
                </>
              ) : (
                <>
                  <EmailCooldown seconds={cooldown.seconds} />
                  <button
                    type="submit"
                    disabled={cooldown.seconds > 0}
                    aria-describedby={cooldown.seconds ? "auth-email-cooldown" : undefined}
                    className={authPrimaryClass}
                  >
                    {t(action.busy ? "auth.sendingReset" : "auth.sendReset")}
                  </button>
                  {recovery.state.status === "idle" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("login");
                        action.setError(null);
                      }}
                      className={authSecondaryClass}
                    >
                      {t("auth.backToLogin")}
                    </button>
                  ) : (
                    <a href={backHref} className={authSecondaryClass}>
                      {t("auth.backToLogin")}
                    </a>
                  )}
                </>
              )}
            </fieldset>
          </form>
          {mode === "login" && (
            <p className="mt-8 text-center text-sm text-muted-foreground">
              {t("auth.noAccount")}{" "}
              <Link to="/signup" className="font-semibold text-primary hover:underline">
                {t("auth.createOne")}
              </Link>
            </p>
          )}
        </>
      )}
    </AuthFrame>
  );
}
