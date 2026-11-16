import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { createI18nInstance } from "@/lib/i18n";
import { LanguageSwitcher } from "../LanguageSwitcher";

vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ invalidate: vi.fn() }) }));

function render(compact: boolean, language: "pt-BR" | "en-US") {
  return renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n: createI18nInstance(language) },
      createElement(LanguageSwitcher, { compact }),
    ),
  );
}

describe.each(["pt-BR", "en-US"] as const)("language selector in %s", (language) => {
  it("uses short compact labels without dropping native accessible names or language values", () => {
    const html = render(true, language);
    expect(html).toContain('value="pt-BR"');
    expect(html).toContain('value="en-US"');
    expect(html).toContain(">PT-BR</option>");
    expect(html).toContain(">EN-US</option>");
    // Accessible names must include the visible code as well as the native name.
    expect(html).toContain('aria-label="PT-BR — Português (Brasil)"');
    expect(html).toContain('aria-label="EN-US — English (US)"');
    expect(html.match(/selected=""/g)).toHaveLength(1);
    expect(html).toContain(`value="${language}"`);
  });
  it("keeps native names visible in full mode", () => {
    const html = render(false, language);
    expect(html).toContain("🇧🇷 Português (Brasil)</option>");
    expect(html).toContain("🇺🇸 English (US)</option>");
    expect(html).toContain(language === "pt-BR" ? 'aria-label="Idioma"' : 'aria-label="Language"');
  });
});
