import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { createI18nInstance, type LanguageCode } from "@/lib/i18n";
import { ALL_PLATFORMS } from "@/lib/growth/platform-rules";
import type { TimingRecommendation } from "@/lib/growth/timing";
import type { SchedulingOptions } from "@/lib/scheduler/scheduling";
import { timingContext, parseTimingResult } from "../best-time";
import { BestTimeResult } from "../components/BestTimeResult";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const channelId = "10000000-0000-4000-8000-000000000002";
const channels: SchedulingOptions["channels"] = [
  {
    id: channelId,
    platform: "youtube",
    handle: "qa-unit",
    status: "disconnected",
    eligible: false,
    reason: "oauth",
  },
];
const data: TimingRecommendation = {
  workspaceId,
  platform: "youtube",
  channel: null,
  timeZone: "Asia/Kolkata",
  referenceAt: "2026-11-02T02:00:00Z",
  best: { at: "2026-11-02T05:30:00Z", confidence: "baseline", samples: 0 },
  topSlots: [
    { at: "2026-11-02T05:30:00Z", weekday: 1, hour: 11, samples: 0, confidence: "baseline" },
    { at: "2026-11-02T06:30:00Z", weekday: 1, hour: 12, samples: 0, confidence: "baseline" },
  ],
  usedFallback: true,
  observationsCount: 0,
  basis: "engagement_count",
  minimum: { total: 6, perSlot: 2 },
  history: { days: 180, maxJobs: 300, latestCapturedAt: null },
  cadence: { perWeek: 2, source: "platform-default", reasonCode: "beginner", hoursPerWeek: null },
};
const render = (
  language: LanguageCode,
  patch: Partial<TimingRecommendation> = {},
  props: { canEdit?: boolean; pending?: boolean; now?: number } = {},
) =>
  renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n: createI18nInstance(language) },
      createElement(BestTimeResult, {
        data: { ...data, ...patch },
        now: Date.parse(data.referenceAt),
        canEdit: true,
        pending: false,
        onUseTime: () => {},
        ...props,
      }),
    ),
  );

describe("explicit timing context and read contract", () => {
  it("does not default an empty or stale choice to Instagram/a different account", () => {
    expect(timingContext("", channels)).toBeNull();
    expect(timingContext("channel:removed-id", channels)).toBeNull();
    expect(timingContext("reference:unknown", channels)).toBeNull();
    expect(timingContext("reference:x", channels)).toBeNull();
  });
  it("derives the actual selected platform, even when a channel cannot publish", () => {
    expect(timingContext(`channel:${channelId}`, channels)).toEqual({
      platform: "youtube",
      channelId,
    });
    expect(timingContext("reference:linkedin", channels)).toEqual({ platform: "linkedin" });
  });
  it("accepts only a result for the requested workspace/platform/channel/timezone", () => {
    expect(parseTimingResult(data, workspaceId, { platform: "youtube" }, data.timeZone)).toEqual(
      data,
    );
    for (const patch of [
      { workspaceId: channelId },
      { platform: "instagram" },
      { channel: { id: channelId, handle: "unit", status: "connected" } },
      { timeZone: "UTC" },
    ])
      expect(() =>
        parseTimingResult(
          { ...data, ...patch },
          workspaceId,
          { platform: "youtube" },
          data.timeZone,
        ),
      ).toThrow();
  });
  it.each([
    { error: "serialized failure" },
    { ...data, best: { ...data.best, at: "invalid" } },
    { ...data, usedFallback: false },
    { ...data, observationsCount: 6 },
    { ...data, best: { ...data.best, confidence: "observed" } },
  ])("rejects incomplete or inconsistent positive results", (raw) => {
    expect(() =>
      parseTimingResult(raw, workspaceId, { platform: "youtube" }, data.timeZone),
    ).toThrow();
  });
});

describe.each(["pt-BR", "en-US"] as const)("timing presentation in %s", (language) => {
  it("shows the named zone/actual offset, generic provenance and fill-only action", () => {
    const html = render(language);
    expect(html).toContain("Asia/Kolkata");
    expect(html).toContain("GMT+5:30");
    expect(html).toContain('dateTime="2026-11-02T05:30:00Z"');
    expect(html).toContain(
      language === "pt-BR" ? "Referência editorial genérica" : "Generic editorial reference",
    );
    expect(html).toContain(
      language === "pt-BR" ? "Só preenche a data e hora" : "Only fills the date and time",
    );
    expect(html).not.toContain("bestTime.");
    expect(html).not.toMatch(/~6|rende \d+%/);
  });
  it("keeps a real channel's insufficient history separate from observed ranking", () => {
    const html = render(language, {
      channel: { id: channelId, handle: "unit", status: "disconnected" },
      observationsCount: 3,
    });
    expect(html).toContain(
      language === "pt-BR" ? "Registros atribuídos: 3" : "Attributed records: 3",
    );
    expect(html).toContain(language === "pt-BR" ? "Canal não conectado" : "Channel not connected");
  });
  it("uses structured observed evidence, not server-language reason/rationale strings", () => {
    const html = render(language, {
      channel: { id: channelId, handle: "unit", status: "connected" },
      usedFallback: false,
      observationsCount: 6,
      best: { ...data.best, confidence: "observed", samples: 2 },
      history: { ...data.history, latestCapturedAt: "2026-11-01T00:00:00Z" },
    });
    expect(html).toContain(
      language === "pt-BR" ? "Histórico deste canal" : "This channel’s history",
    );
    expect(html).toContain(
      language === "pt-BR" ? "início de envio registrado" : "Recorded send start",
    );
    expect(html).toContain("180");
    expect(html).toContain("300");
  });
  it("never offers the fill action to a viewer", () => {
    const html = render(language, {}, { canEdit: false });
    expect(html).not.toContain("<button");
    expect(html).toContain(language === "pt-BR" ? "acesso de edição" : "Editing access");
  });
  it("disables use during a refresh/mutation and after the window expires", () => {
    expect(render(language, {}, { pending: true })).toMatch(/<button[^>]*disabled=""/);
    const expired = render(language, {}, { now: Date.parse(data.best.at) + 1000 });
    expect(expired).toMatch(/<button[^>]*disabled=""/);
    expect(expired).toContain(language === "pt-BR" ? "já passou" : "has passed");
  });
  it.each(ALL_PLATFORMS)("has localized editorial guidance for %s", (platform) => {
    const html = render(language, { platform });
    expect(html).not.toContain("bestTime.");
    if (language === "en-US")
      expect(html).not.toMatch(
        /Melhor horário|Janela padrão|Cadência sustentável|Regra do formato/,
      );
  });
  it.each(["low_budget", "daily_budget", "beginner", "platform_default"] as const)(
    "localizes cadence rationale %s",
    (reasonCode) => {
      expect(
        render(language, { cadence: { ...data.cadence, reasonCode, hoursPerWeek: 2 } }),
      ).not.toContain("bestTime.");
    },
  );
});
