import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nInstance, type LanguageCode } from "@/lib/i18n";
import { PublishCapabilityStrip } from "../components/PublishCapabilityStrip";

const mocks = vi.hoisted(() => ({ query: vi.fn(), fetch: vi.fn(), refetch: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.query }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/services", () => ({ GrowthService: { getPublishCapabilities: mocks.fetch } }));

function render(language: LanguageCode) {
  return renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n: createI18nInstance(language) },
      createElement(PublishCapabilityStrip),
    ),
  );
}

describe.each(["pt-BR", "en-US"] as const)("configuration query state in %s", (language) => {
  beforeEach(() => vi.clearAllMocks());
  it("does not announce zero available integrations while the query is pending", () => {
    mocks.query.mockReturnValue({ isLoading: true, data: undefined });
    const html = render(language);
    expect(html).toContain('role="status"');
    expect(html).not.toContain("0 de");
    expect(html).not.toContain("0 of");
    expect(html).not.toContain("<details");
  });
  it("keeps a missing response unconfirmed instead of inventing an empty capability list", () => {
    mocks.query.mockReturnValue({ isLoading: false, data: undefined });
    expect(render(language)).toContain('role="status"');
  });
  it("shows failure and an explicit retry, even when an older response is cached", () => {
    mocks.query.mockReturnValue({
      isError: true,
      refetch: mocks.refetch,
      data: { platforms: [], simulated: false },
    });
    const html = render(language);
    expect(html).toContain('role="alert"');
    expect(html).toContain("<button");
    expect(html).toContain(language === "pt-BR" ? "Tentar novamente" : "Try again");
    expect(html).not.toContain("<details");
    expect(mocks.refetch).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
