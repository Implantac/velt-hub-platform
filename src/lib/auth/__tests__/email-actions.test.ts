import { describe, expect, it } from "vitest";
import { authEmailRedirect, emailRetrySeconds, savedEmailDeadline } from "../email-actions";

describe("authentication email redirects", () => {
  it.each(["https://velt.invalid", "https://3000-preview.e2b.app", "http://localhost:3000"])(
    "uses the caller's fixed origin: %s",
    (origin) => {
      expect(authEmailRedirect(origin, "signup")).toBe(`${origin}/app`);
      expect(authEmailRedirect(origin, "recovery")).toBe(`${origin}/login?mode=reset`);
    },
  );
  it("does not inherit a path, search, hash or foreign redirect parameter", () => {
    expect(
      authEmailRedirect("https://velt.invalid/a?redirect=https://evil.invalid#fragment", "signup"),
    ).toBe("https://velt.invalid/app");
  });
  it.each([
    "javascript:alert(1)",
    "file:///tmp/test",
    "https://user:pass@velt.invalid",
    "not-a-url",
  ])("rejects a non-web or credential-bearing origin: %s", (origin) => {
    expect(() => authEmailRedirect(origin, "recovery")).toThrow();
  });
});

describe("email pacing feedback (not server rate limiting)", () => {
  it.each([
    [60000, 0, 60],
    [60000, 1, 60],
    [60000, 59001, 1],
    [60000, 60000, 0],
    [60000, 61000, 0],
    [9000000, 0, 60],
    [NaN, 0, 0],
    [Infinity, 0, 0],
  ])("computes %s - %s as %s seconds", (deadline, now, seconds) => {
    expect(emailRetrySeconds(deadline, now)).toBe(seconds);
  });
  it.each([null, "", "not-a-number", "Infinity", "-10", "900"])(
    "ignores an invalid or expired saved deadline: %s",
    (value) => {
      expect(savedEmailDeadline(value, 1000)).toBe(0);
    },
  );
  it("retains the delay on reload without storing the email and caps clock drift", () => {
    expect(savedEmailDeadline("2000", 1000)).toBe(2000);
    expect(savedEmailDeadline("9999999999", 1000)).toBe(61000);
  });
});
