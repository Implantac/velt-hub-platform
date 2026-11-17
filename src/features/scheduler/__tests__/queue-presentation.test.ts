import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nInstance, type LanguageCode } from "@/lib/i18n";
import type { SchedulerJob } from "@/lib/api/_types";
import { SchedulerTable } from "../components/SchedulerTable";
import { SchedulerJobActions } from "../components/SchedulerJobActions";

const now = Date.parse("2026-11-12T12:00:00Z");
const job: SchedulerJob = {
  id: "10000000-0000-4000-8000-000000000001",
  workspace_id: "10000000-0000-4000-8000-000000000002",
  content_id: "10000000-0000-4000-8000-000000000003",
  channel_id: "10000000-0000-4000-8000-000000000004",
  content: { title: "A very long title " + "unbroken".repeat(30), type: "post" },
  channel: { platform: "youtube", handle: "unit-only-" + "handle".repeat(20) },
  status: "pending",
  scheduled_at: "2026-12-12T15:00:00Z",
  attempts: 0,
  max_attempts: 3,
  created_at: "2026-11-12T10:00:00Z",
  updated_at: "2026-11-12T10:00:00Z",
  external_post_id: null,
  last_error: null,
  locked_until: null,
  run_at: null,
  delivery_token: null,
  delivery_started_at: null,
  provider_platform: null,
  provider_target: null,
  provider_reference: null,
  provider_reference_kind: null,
  reconcile_state: "none",
  reconcile_after: null,
  reconcile_attempts: 0,
  reconcile_token: null,
  reconcile_locked_until: null,
  reconciled_at: null,
  reconcile_note: null,
};
const actions = {
  cancelPending: false,
  canManage: true,
  checkPending: false,
  onCancel: () => {},
  onCheck: () => {},
  onReview: () => {},
};
function render(language: LanguageCode, patch: Partial<SchedulerJob> = {}) {
  return renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n: createI18nInstance(language) },
      createElement(SchedulerTable, { jobs: [{ ...job, ...patch }], ...actions }),
    ),
  );
}
function buttons(patch: Partial<SchedulerJob>, overrides: Partial<typeof actions> = {}) {
  return renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n: createI18nInstance("en-US") },
      createElement(SchedulerJobActions, {
        job: { ...job, ...patch },
        now,
        ...actions,
        ...overrides,
      }),
    ),
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("TZ", "UTC");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe.each(["pt-BR", "en-US"] as const)("queue presentation in %s", (language) => {
  it("ships mobile articles and a desktop table without hiding status/receipts/actions from either", () => {
    const html = render(language);
    expect(html).toContain("md:hidden");
    expect(html).toContain("md:block");
    expect(html).toContain("<article");
    expect(html).toContain("<table");
    expect(html).toContain('scope="row"');
    expect(html.match(/scope="col"/g)).toHaveLength(6);
    expect(html.match(/>Cancel(?:ar)?<\/button>/g)).toHaveLength(2);
    expect(html).toContain("overflow-wrap:anywhere");
    expect(html).not.toContain("scheduler.");
  });
  it("shows the absolute instant, relative time and named zone, not only an approximate distance", () => {
    const html = render(language);
    expect(html).toContain("2026-12-12T15:00:00Z");
    expect(html).toContain("UTC");
    expect(html).toContain("2026");
    expect(html).toContain(language === "pt-BR" ? "armazenados em UTC" : "stored in UTC");
  });
  it("escapes long preserved failure/check text and leaves a keyboard-accessible receipt disclosure", () => {
    const html = render(language, {
      status: "dead_letter",
      reconcile_state: "pending",
      provider_reference: "<script>not-executable</script>",
      reconcile_note: "<img src=x onerror=alert(1)>",
      last_error: "long-error-".repeat(40),
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<summary");
  });
  it("does not throw or invent a date when a legacy scheduled value is malformed", () => {
    expect(render(language, { scheduled_at: "not-a-date" })).not.toContain('dateTime="not-a-date"');
  });
});

describe("shared queue actions preserve conservative controls", () => {
  it("only pending, unreconciled attempts have a cancel action", () => {
    expect(buttons({})).toContain(">Cancel</button>");
    for (const patch of [
      { status: "processing" },
      { status: "succeeded" },
      { status: "failed" },
      { status: "dead_letter", reconcile_state: "pending" },
    ] as Partial<SchedulerJob>[])
      expect(buttons(patch)).not.toContain(">Cancel</button>");
  });
  it("disables cancellation for read-only or busy callers", () => {
    expect(buttons({}, { cancelPending: true })).toMatch(/<button[^>]*disabled=""/);
  });
  it("does not enable confirmation checks before cooldown or while fenced", () => {
    const pending: Partial<SchedulerJob> = {
      status: "dead_letter",
      reconcile_state: "pending",
      provider_reference: "original-reference",
      reconcile_after: "2026-11-12T12:01:00Z",
    };
    expect(buttons(pending)).toMatch(/<button[^>]*disabled=""/);
    expect(
      buttons({
        ...pending,
        reconcile_after: "2026-11-12T11:00:00Z",
        reconcile_locked_until: "2026-11-12T12:01:00Z",
      }),
    ).toMatch(/<button[^>]*disabled=""/);
    expect(buttons({ ...pending, reconcile_after: "2026-11-12T11:00:00Z" })).not.toContain(
      'disabled=""',
    );
  });
  it("never enables review actions for a viewer or adds a resend shortcut", () => {
    const html = buttons(
      {
        status: "dead_letter",
        reconcile_state: "review",
        provider_reference: "original-reference",
        reconcile_after: "2026-11-12T11:00:00Z",
      },
      { canManage: false },
    );
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain("Close review");
    expect(html).toContain("Check confirmation");
    expect(html).not.toMatch(/>Retry<|>Resend<|>Publish</);
  });
});
