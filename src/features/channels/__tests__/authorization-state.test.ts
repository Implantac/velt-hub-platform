import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
vi.mock("../components/BusinessLocationPicker", () => ({ BusinessLocationPicker: () => null }));
import { createI18nInstance, type LanguageCode } from "@/lib/i18n";
import type { Channel } from "@/lib/api/_types";
import { ChannelCard } from "../components/ChannelCard";
const base: Channel = {
  id: "qa-channel",
  workspace_id: "qa-workspace",
  brand_id: null,
  brand: null,
  platform: "tiktok",
  external_id: "QA_ACCOUNT",
  handle: "QA Profile",
  status: "expired",
  metadata: {},
  connected_at: null,
  created_at: "2026-11-12T00:00:00Z",
  updated_at: "2026-11-12T00:00:00Z",
  last_synced_at: null,
  oauth_revoked_at: null,
  oauth_authorization_started_at: null,
  authorization_issue: "refresh_uncertain",
};
function render(language: LanguageCode, patch: Partial<Channel> = {}, disabled = false) {
  return renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n: createI18nInstance(language) },
      createElement(ChannelCard, {
        channel: { ...base, ...patch },
        workspaceId: base.workspace_id,
        disabled,
        onConnect: () => {},
        onDisconnect: () => {},
        onDelete: () => {},
      }),
    ),
  );
}
describe("truthful OAuth state in channel cards", () => {
  it("explains uncertainty and offers explicit same-account reconnect and local disconnect, never false Connected", () => {
    const html = render("pt-BR");
    expect(html).toContain("resultado da renovação é incerto");
    expect(html).toContain("Conexão expirada");
    expect(html).toContain("Reconectar a mesma conta");
    expect(html).toContain("Desconectar");
    expect(html).not.toContain(">Conectado<");
    expect(html).not.toContain("bg-success/20");
  });
  it("has an English explanation and action rather than falling back to a raw issue code", () => {
    const html = render("en-US");
    expect(html).toContain("refresh outcome is uncertain");
    expect(html).toContain("Reconnect the same account");
    expect(html).toContain("Connection expired");
    expect(html).not.toContain("refresh_uncertain");
  });
  it.each(["invalid_grant", "missing_refresh", "invalid_token", "provider_unauthorized"])(
    "localizes the expired authorization reason %s",
    (authorization_issue) => {
      for (const language of ["pt-BR", "en-US"] as const)
        expect(render(language, { authorization_issue })).not.toContain(
          `authorizationIssues.${authorization_issue}`,
        );
    },
  );
  it("disables all three management actions for non-managers/busy workspace actions", () => {
    expect(render("pt-BR", {}, true).match(/disabled=""/g)).toHaveLength(3);
  });
  it("does not label a manual disconnected profile as connected or as an uncertain rotating grant", () => {
    const html = render("pt-BR", {
      external_id: null,
      status: "disconnected",
      authorization_issue: null,
    });
    expect(html).toContain("Desconectado");
    expect(html).not.toContain("resultado da renovação");
    expect(html).not.toContain("Reconectar a mesma conta");
  });
});
