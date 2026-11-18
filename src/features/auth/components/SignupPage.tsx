import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { FEATURES } from "@/lib/features/flags";
import { DISPLAY_NAME_MAX_LENGTH, displayNameSchema } from "@/lib/profile/profile";
import { authErrorTranslationKey } from "@/lib/auth/auth-error-message";
import { authEmailRedirect } from "@/lib/auth/email-actions";
import { useAuthAction } from "../hooks/useAuthAction";
import { useEmailCooldown } from "../hooks/useEmailCooldown";
import { AuthFrame, authInputClass, authPrimaryClass, authSecondaryClass } from "./AuthFrame";
import { AuthError, EmailCooldown } from "./AuthFeedback";
import { PasswordField } from "./PasswordField";
import { GoogleSignIn } from "./GoogleSignIn";

export function SignupPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const action = useAuthAction();
  const cooldown = useEmailCooldown();
  const describedBy = action.error ? "auth-form-error" : undefined;

  useEffect(() => {
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && session?.user && event !== "PASSWORD_RECOVERY") onAuthenticated();
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [onAuthenticated]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsedName = displayNameSchema.safeParse(name);
    if (!parsedName.success) {
      action.setError("auth.nameInvalid");
      return;
    }
    if (password.length < 8) {
      action.setError("auth.weakPassword");
      return;
    }
    const submittedEmail = email.trim();
    void action.run(async (isCurrent) => {
      const { data, error } = await supabase.auth.signUp({
        email: submittedEmail,
        password,
        options: {
          emailRedirectTo: authEmailRedirect(window.location.origin, "signup"),
          data: { full_name: parsedName.data },
        },
      });
      if (!isCurrent()) return;
      if (error) {
        const key = authErrorTranslationKey(error);
        if (key === "auth.tooManyAttempts") cooldown.start();
        action.setError(key);
      } else if (data.session?.user) {
        toast.success(t("auth.accountCreated"));
        onAuthenticated();
      } else if (data.user) {
        // The provider may deliberately obfuscate an existing account. Stay neutral.
        setPassword("");
        setConfirmationEmail(submittedEmail);
        cooldown.start();
      } else {
        action.setError("auth.authUnavailable");
      }
    });
  }

  function handleResend() {
    if (!confirmationEmail || cooldown.seconds) return;
    void action.run(async (isCurrent) => {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: confirmationEmail,
        options: { emailRedirectTo: authEmailRedirect(window.location.origin, "signup") },
      });
      if (!isCurrent()) return;
      if (error) {
        const key = authErrorTranslationKey(error);
        if (key === "auth.tooManyAttempts") cooldown.start();
        action.setError(key);
      } else {
        cooldown.start();
        toast.success(t("auth.confirmationResent"));
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
      headingId="signup-heading"
      title={t(confirmationEmail ? "auth.checkEmailTitle" : "auth.signupTitle")}
      subtitle={t(confirmationEmail ? "auth.confirmationHelp" : "auth.signupSubtitle")}
    >
      <AuthError error={action.error} />
      {confirmationEmail ? (
        <div className="space-y-4" aria-busy={action.busy}>
          <p
            role="status"
            className="break-words rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground"
          >
            {t("auth.checkEmailBody", { email: confirmationEmail })}
          </p>
          <EmailCooldown seconds={cooldown.seconds} />
          <button
            type="button"
            onClick={handleResend}
            disabled={action.busy || cooldown.seconds > 0}
            aria-describedby={cooldown.seconds ? "auth-email-cooldown" : undefined}
            className={authSecondaryClass}
          >
            {t(action.busy ? "auth.resendingConfirmation" : "auth.resendConfirmation")}
          </button>
          <button
            type="button"
            disabled={action.busy}
            onClick={() => {
              setConfirmationEmail(null);
              action.setError(null);
            }}
            className={authSecondaryClass}
          >
            {t("auth.editSignupDetails")}
          </button>
          <Link
            to="/login"
            className="block min-h-11 py-3 text-center text-sm font-semibold text-primary hover:underline"
          >
            {t("auth.backToLogin")}
          </Link>
        </div>
      ) : (
        <>
          {FEATURES.googleAuth && <GoogleSignIn onClick={handleGoogle} disabled={action.busy} />}
          <form onSubmit={handleSubmit} aria-busy={action.busy} className="space-y-4">
            <fieldset disabled={action.busy} className="min-w-0 space-y-4">
              <legend className="sr-only">{t("auth.signupTitle")}</legend>
              <div className="space-y-1.5">
                <label
                  htmlFor="signup-name"
                  className="ml-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  {t("common.name")}
                </label>
                <input
                  id="signup-name"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={DISPLAY_NAME_MAX_LENGTH}
                  placeholder={t("auth.namePlaceholder")}
                  className={authInputClass}
                  aria-describedby={describedBy}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="signup-email"
                  className="ml-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  {t("common.email")}
                </label>
                <input
                  id="signup-email"
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
              <PasswordField
                id="signup-password"
                name="password"
                label={t("common.password")}
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("auth.passwordPlaceholder")}
                aria-describedby={describedBy}
              />
              <button type="submit" className={authPrimaryClass}>
                {t(action.busy ? "auth.creating" : "common.createAccount")}
              </button>
            </fieldset>
          </form>
          <p className="mt-8 text-center text-sm text-muted-foreground">
            {t("auth.alreadyOnboard")}{" "}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              {t("common.signIn")}
            </Link>
          </p>
        </>
      )}
    </AuthFrame>
  );
}
