import { describe, expect, it } from "vitest";
import { authErrorTranslationKey } from "../auth-error-message";

describe("safe actionable Auth errors", () => {
  it.each([
    [{ code: "invalid_credentials" }, "auth.invalidCredentials"],
    [{ code: "email_not_confirmed" }, "auth.emailNotConfirmed"],
    [{ code: "same_password" }, "auth.samePassword"],
    [{ code: "weak_password" }, "auth.weakPassword"],
    [{ code: "email_address_invalid" }, "auth.invalidEmail"],
    [{ code: "over_request_rate_limit" }, "auth.tooManyAttempts"],
    [{ code: "over_email_send_rate_limit" }, "auth.tooManyAttempts"],
    [{ status: 429, message: "Invalid credentials" }, "auth.tooManyAttempts"],
    [{ code: "session_not_found" }, "auth.sessionExpired"],
    [{ code: "bad_jwt" }, "auth.sessionExpired"],
    [{ code: "refresh_token_not_found" }, "auth.sessionExpired"],
    [{ code: "refresh_token_already_used" }, "auth.sessionExpired"],
    [{ name: "AuthSessionMissingError" }, "auth.sessionExpired"],
    [{ message: "Invalid login credentials" }, "auth.invalidCredentials"],
    [{ message: "User already registered" }, "auth.emailAlreadyRegistered"],
    [{ message: "Password should have at least 8 characters" }, "auth.weakPassword"],
    [{ message: "Email address is invalid" }, "auth.invalidEmail"],
  ])("maps %j to %s", (error, key) => {
    expect(authErrorTranslationKey(error)).toBe(key);
  });
  it.each([
    undefined,
    null,
    42,
    {},
    new TypeError("Failed to fetch"),
    { message: { secret: "test-only" } },
    "raw provider error with test-only-secret",
  ])("does not display an unknown rejection: %j", (error) => {
    expect(authErrorTranslationKey(error)).toBe("auth.authUnavailable");
  });
  it("does not throw again while reading a malformed rejection", () => {
    const error = {
      get message() {
        throw new Error("test-only getter");
      },
    };
    expect(authErrorTranslationKey(error)).toBe("auth.authUnavailable");
  });
});
