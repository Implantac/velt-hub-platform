import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { createI18nInstance, type LanguageCode } from "@/lib/i18n";
import type { SchedulerJob } from "@/lib/api/_types";
import { SchedulerTable } from "../components/SchedulerTable";

const base: SchedulerJob = {
  id: "22222222-2222-4222-8222-222222222222",
  workspace_id: "11111111-1111-4111-8111-111111111111",
  content_id: "33333333-3333-4333-8333-333333333333",
  channel_id: "44444444-4444-4444-8444-444444444444",
  content: { title: "Synthetic uncertain delivery", type: "post" },
  channel: { platform: "instagram", handle: "qa-only" },
  status: "dead_letter",
  reconcile_state: "none",
  attempts: 1,
  max_attempts: 3,
  external_post_id: "QA_LEGACY_CONTAINER_NOT_PUBLIC",
  delivery_token: null,
  delivery_started_at: null,
  provider_platform: null,
  provider_target: null,
  provider_reference: null,
  provider_reference_kind: null,
  reconcile_after: null,
  reconcile_attempts: 0,
  reconcile_token: null,
  reconcile_locked_until: null,
  reconciled_at: null,
  reconcile_note: null,
  last_error: null,
  locked_until: null,
  run_at: null,
  created_at: "2026-11-12T00:00:00Z",
  updated_at: "2026-11-12T00:00:00Z",
  scheduled_at: "2026-12-12T00:00:00Z",
};
function render(language: LanguageCode, patch: Partial<SchedulerJob> = {}, canManage = true) {
  return renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n: createI18nInstance(language) },
      createElement(SchedulerTable, {
        jobs: [{ ...base, ...patch }],
        canManage,
        cancelPending: false,
        checkPending: false,
        onCancel: () => {},
        onCheck: () => {},
        onReview: () => {},
      }),
    ),
  );
}

describe("honest reconciliation UI", () => {
  it.each(["pt-BR", "en-US"] as const)(
    "exposes the untyped legacy reference before recovery in %s, not a fabricated publication",
    (language) => {
      const html = render(language);
      expect(html).toContain("QA_LEGACY_CONTAINER_NOT_PUBLIC");
      expect(html).toContain("upload/container");
      expect(html).toContain("<details");
      expect(html).not.toContain("scheduler.");
      expect(html).not.toContain(language === "pt-BR" ? "Concluído" : "Succeeded");
    },
  );
  it("never presents a confirmed post as a legacy upload", () => {
    const html = render("pt-BR", { status: "succeeded", reconcile_state: "confirmed" });
    expect(html).toContain("Concluído");
    expect(html).not.toContain("QA_LEGACY_CONTAINER_NOT_PUBLIC");
    expect(html).not.toContain("upload/container");
  });
  it("prefers the typed reference and escapes the preserved check note", () => {
    const html = render("en-US", {
      reconcile_state: "pending",
      provider_reference: "12345",
      reconcile_note: "<script>not executable</script>",
    });
    expect(html).toContain("12345");
    expect(html).not.toContain("QA_LEGACY_CONTAINER_NOT_PUBLIC");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;not executable&lt;/script&gt;");
    expect(html).toContain("Awaiting confirmation");
  });
  it("exposes review controls to read-only members only as disabled actions", () => {
    const html = render("en-US", { reconcile_state: "review" }, false);
    expect(html).toContain("Review required");
    expect(html).toContain("Close review");
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).not.toContain(">Cancel<");
  });
});
