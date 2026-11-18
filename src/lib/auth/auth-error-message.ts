export type AuthErrorTranslationKey =
  | "auth.invalidCredentials"
  | "auth.invalidEmail"
  | "auth.emailAlreadyRegistered"
  | "auth.weakPassword"
  | "auth.tooManyAttempts"
  | "auth.emailNotConfirmed"
  | "auth.samePassword"
  | "auth.sessionExpired"
  | "auth.nameInvalid"
  | "auth.passwordMismatch"
  | "auth.resetEmailFailed"
  | "auth.authUnavailable";

/** Map stable provider codes first; never display raw messages or callback URLs. */
export function authErrorTranslationKey(error: unknown): AuthErrorTranslationKey {
  let message = "";
  let code = "";
  let status: unknown;
  try {
    if (typeof error === "string") message = error.toLowerCase();
    else if (error && typeof error === "object") {
      const details = error as {
        message?: unknown;
        code?: unknown;
        status?: unknown;
        name?: unknown;
      };
      message = typeof details.message === "string" ? details.message.toLowerCase() : "";
      code = typeof details.code === "string" ? details.code : "";
      status = details.status;
      if (details.name === "AuthSessionMissingError") return "auth.sessionExpired";
    }
  } catch {
    return "auth.authUnavailable";
  }
  if (status === 429 || code === "over_request_rate_limit" || code === "over_email_send_rate_limit")
    return "auth.tooManyAttempts";
  if (code === "email_not_confirmed") return "auth.emailNotConfirmed";
  if (code === "same_password") return "auth.samePassword";
  if (
    [
      "session_not_found",
      "bad_jwt",
      "refresh_token_not_found",
      "refresh_token_already_used",
    ].includes(code)
  ) {
    return "auth.sessionExpired";
  }
  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials") ||
    message.includes("invalid credentials")
  ) {
    return "auth.invalidCredentials";
  }
  if (
    code === "user_already_exists" ||
    message.includes("already registered") ||
    message.includes("user already exists")
  ) {
    return "auth.emailAlreadyRegistered";
  }
  if (
    code === "weak_password" ||
    message.includes("weak password") ||
    message.includes("password should")
  ) {
    return "auth.weakPassword";
  }
  if (
    code === "email_address_invalid" ||
    message.includes("invalid email") ||
    message.includes("email address is invalid")
  ) {
    return "auth.invalidEmail";
  }
  return "auth.authUnavailable";
}
