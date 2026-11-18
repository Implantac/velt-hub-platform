import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { createI18nInstance } from "@/lib/i18n";
import { LoginPage } from "../components/LoginPage";
import { SignupPage } from "../components/SignupPage";
import { PasswordField } from "../components/PasswordField";
import { EmailCooldown } from "../components/AuthFeedback";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children: ReactNode; className: string }) =>
    createElement("a", { href: to, className }, children),
  useRouter: () => ({ invalidate: vi.fn() }),
}));
vi.mock("@/integrations/lovable", () => ({ lovable: { auth: { signInWithOAuth: vi.fn() } } }));

function render(language: "pt-BR" | "en-US", node: ReactNode) {
  return renderToStaticMarkup(
    createElement(I18nextProvider, { i18n: createI18nInstance(language) }, node),
  );
}

describe.each(["pt-BR", "en-US"] as const)("Auth SSR in %s", (language) => {
  it("does not render a new-password form before a recovery session is checked", () => {
    const html = render(
      language,
      createElement(LoginPage, {
        returnTo: "/app/content",
        recoveryRequested: true,
        onAuthenticated: vi.fn(),
      }),
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-labelledby="login-heading"');
    expect(html).not.toContain('name="new-password"');
    expect(html).not.toContain('name="password"');
    expect(html).not.toContain('name="email"');
  });
  it("preserves password-manager semantics and labels on normal sign-in", () => {
    const html = render(
      language,
      createElement(LoginPage, {
        returnTo: "/app",
        recoveryRequested: false,
        onAuthenticated: vi.fn(),
      }),
    );
    expect(html).toContain('for="login-email"');
    expect(html).toContain('for="login-password"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('aria-controls="login-password"');
    expect(html).toContain('type="password"');
    expect(html).not.toContain("auth.loginTitle");
  });
  it("uses the same bounded name rule as profile settings at signup", () => {
    const html = render(language, createElement(SignupPage, { onAuthenticated: vi.fn() }));
    expect(html).toContain('aria-labelledby="signup-heading"');
    expect(html).toContain('maxLength="80"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain('minLength="8"');
    expect(html).not.toContain("auth.signupTitle");
  });
  it("password visibility is an explicitly labelled non-submit control", () => {
    const label = createI18nInstance(language).t("auth.newPassword");
    const html = render(
      language,
      createElement(PasswordField, { id: "new", label, autoComplete: "new-password" }),
    );
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-controls="new"');
    expect(html).toContain(`aria-label="${language === "pt-BR" ? "Mostrar" : "Show"}: ${label}"`);
  });
  it("does not announce a countdown every second", () => {
    const html = render(language, createElement(EmailCooldown, { seconds: 42 }));
    expect(html).toContain('aria-live="off"');
    expect(html).toContain("42");
    expect(html).not.toContain("{{count}}");
    expect(html).not.toContain('role="status"');
    expect(render(language, createElement(EmailCooldown, { seconds: 0 }))).toBe("");
  });
});
