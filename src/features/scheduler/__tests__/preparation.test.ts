import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { createI18nInstance, type LanguageCode } from "@/lib/i18n";
import type { SchedulingOptions } from "@/lib/scheduler/scheduling";
import { schedulingPreparation } from "../preparation";
import { SchedulePreparation } from "../components/SchedulePreparation";
import { PublishConfiguration } from "../components/PublishConfiguration";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) =>
    createElement("a", { href: to, className }, children),
}));

const draft = { id: "qa-draft", title: "QA draft", status: "draft" };
function channel(reason = "oauth", eligible = false) {
  return {
    id: `qa-${reason}-${eligible}`,
    platform: "facebook",
    handle: "qa-only",
    status: eligible ? "connected" : "disconnected",
    reason,
    eligible,
  };
}
function options(channels: SchedulingOptions["channels"] = [], hasDraft = true): SchedulingOptions {
  return { contents: hasDraft ? [draft] : [], channels };
}
function render(language: LanguageCode, node: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(
    createElement(I18nextProvider, { i18n: createI18nInstance(language) }, node),
  );
}

describe("next scheduling step, not a new authorization gate", () => {
  it.each([options(), options([channel("", true)]), options([], false)])(
    "never asks a read-only member to create content or authorize a channel",
    (data) => {
      expect(schedulingPreparation(data, false).kind).toBe("readonly");
    },
  );
  it("starts with a draft even if a channel still needs setup", () => {
    expect(schedulingPreparation(options([channel()], false), true)).toEqual({
      kind: "draft",
      availableChannels: 0,
    });
  });
  it("does not require another connection when an authorized option is already eligible", () => {
    expect(schedulingPreparation(options([channel(), channel("", true)]), true)).toEqual({
      kind: "ready",
      availableChannels: 1,
    });
  });
  it("counts only the options the server returned as eligible", () => {
    expect(
      schedulingPreparation(options([channel("", true), channel("other", true)]), true),
    ).toEqual({ kind: "ready", availableChannels: 2 });
  });
  it("distinguishes no channel from a channel with a failed requirement", () => {
    expect(schedulingPreparation(options(), true)).toEqual({
      kind: "channels",
      reason: "none",
      availableChannels: 0,
    });
  });
  it.each(["oauth", "environment", "location", "unsupported", "direct_post"])(
    "preserves the actual %s requirement instead of suggesting a generic reconnection",
    (reason) => {
      expect(schedulingPreparation(options([channel(reason)]), true)).toMatchObject({
        kind: "channels",
        reason,
      });
    },
  );
  it("does not pretend all channels have the same reason when their requirements differ", () => {
    expect(
      schedulingPreparation(options([channel("oauth"), channel("environment")]), true),
    ).toEqual({
      kind: "channels",
      reason: "other",
      availableChannels: 0,
    });
  });
  it("falls back safely for a future reason instead of rendering a translation key", () => {
    expect(schedulingPreparation(options([channel("future-reason")]), true)).toMatchObject({
      reason: "other",
    });
  });
});

describe.each(["pt-BR", "en-US"] as const)("scheduling guidance in %s", (language) => {
  it("provides one real draft destination and says saving is not publishing", () => {
    const html = render(
      language,
      createElement(SchedulePreparation, { options: options([], false), canEdit: true }),
    );
    expect(html).toContain('href="/app/content"');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain(language === "pt-BR" ? "não publica nada" : "does not publish anything");
    expect(html).not.toContain("scheduler.preparation.");
  });
  it("does not offer an editing action to a viewer", () => {
    const html = render(
      language,
      createElement(SchedulePreparation, { options: options(), canEdit: false }),
    );
    expect(html).not.toContain("<a ");
    expect(html).toContain(language === "pt-BR" ? "modo de consulta" : "read-only access");
  });
  it.each(["oauth", "environment", "location", "unsupported", "direct_post", "future-reason"])(
    "localizes %s and links to channels without attempting consent",
    (reason) => {
      const html = render(
        language,
        createElement(SchedulePreparation, { options: options([channel(reason)]), canEdit: true }),
      );
      expect(html).toContain('href="/app/channels"');
      expect(html).not.toContain("scheduler.preparation.");
      expect(html).not.toContain("undefined");
      expect(html).not.toContain("<button");
    },
  );
  it.each([1, 2])("shows %i available option(s), not an already published result", (count) => {
    const html = render(
      language,
      createElement(SchedulePreparation, {
        options: options(Array.from({ length: count }, (_, i) => channel(String(i), true))),
        canEdit: true,
      }),
    );
    expect(html).toContain(String(count));
    expect(html).toContain(language === "pt-BR" ? "verificada novamente" : "checked again");
    expect(html).not.toContain("scheduler.preparation.");
    expect(html).not.toContain("<a ");
  });
});

const capabilities = [
  { platform: "facebook", implemented: true, credentialsReady: true, missingEnv: [] },
  { platform: "youtube", implemented: true, credentialsReady: false, missingEnv: ["QA_ENV_NAME"] },
  { platform: "x", implemented: false, credentialsReady: true, missingEnv: [] },
];
describe.each(["pt-BR", "en-US"] as const)("configuration details in %s", (language) => {
  it("excludes unimplemented platforms from the configured count and keeps full detail available", () => {
    const html = render(
      language,
      createElement(PublishConfiguration, { platforms: capabilities, simulated: false }),
    );
    expect(html).toContain(language === "pt-BR" ? "1 de 2" : "1 of 2");
    expect(html).toContain("QA_ENV_NAME");
    expect(html).toContain("<details");
    expect(html).not.toMatch(/<details[^>]* open/);
    expect(html).toContain("OAuth");
    expect(html).toContain(language === "pt-BR" ? "não confirma" : "does not confirm");
    expect(html).not.toContain("scheduler.");
  });
  it("keeps simulation warning outside the closed details", () => {
    const html = render(
      language,
      createElement(PublishConfiguration, { platforms: capabilities, simulated: true }),
    );
    const warning = language === "pt-BR" ? "modo simulado" : "simulation mode";
    expect(html).toContain('role="alert"');
    expect(html.indexOf(warning)).toBeGreaterThan(-1);
    expect(html.indexOf(warning)).toBeLessThan(html.indexOf("<details"));
  });
  it("does not turn an empty capability registry into a ready configuration", () => {
    const html = render(
      language,
      createElement(PublishConfiguration, { platforms: [], simulated: false }),
    );
    expect(html).toContain(language === "pt-BR" ? "Nenhuma integração" : "No integrations");
    expect(html).not.toContain("<details");
  });
  it("escapes future labels and configuration names", () => {
    const html = render(
      language,
      createElement(PublishConfiguration, {
        platforms: [
          {
            platform: "<script>unknown</script>",
            implemented: true,
            credentialsReady: false,
            missingEnv: ["<script>not a secret</script>"],
          },
        ],
        simulated: false,
      }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
