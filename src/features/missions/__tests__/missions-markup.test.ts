import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createI18nInstance } from "@/lib/i18n";
import { MISSION_STATUSES } from "@/lib/missions/contracts";
import { mission, page } from "@/lib/missions/__tests__/fixtures";
import { MissionBoard, MissionCard } from "../components/MissionBoard";
import { MissionComposer } from "../components/MissionComposer";
import { MissionFilters } from "../components/MissionFilters";
import { MissionResults } from "../components/MissionResults";
import { MissionMutationFeedback } from "../components/MissionMutationFeedback";
import en from "@/lib/i18n/locales/en-US.json";
import pt from "@/lib/i18n/locales/pt-BR.json";

const composer = {
  draft: { title: "A measurable goal", description: "Details", priority: 0 },
  onChange: vi.fn(),
  onSubmit: vi.fn(),
  canWrite: true,
  busy: false,
  isSaving: false,
};
const results = {
  data: page(),
  requestedPage: 1,
  isError: false,
  isFetching: false,
  busy: false,
  canEdit: true,
  canWrite: true,
  updatingId: null,
  onRetry: vi.fn(),
  onPage: vi.fn(),
  onMove: vi.fn(),
};
const feedbackProps = {
  review: null,
  confirmed: false,
  onConfirm: vi.fn(),
  onResume: vi.fn(),
  onRefresh: vi.fn(),
  disabled: false,
  canEdit: true,
};
function render(language: "pt-BR" | "en-US", node: ReactNode) {
  return renderToStaticMarkup(
    createElement(I18nextProvider, { i18n: createI18nInstance(language) }, node),
  );
}

describe.each(["pt-BR", "en-US"] as const)("mission markup in %s", (language) => {
  const t = createI18nInstance(language).t;
  it.each([false, true])("never calls an unconfirmed loading/error read empty (%s)", (isError) => {
    const html = render(
      language,
      createElement(MissionResults, { ...results, data: undefined, isError }),
    );
    expect(html).toContain(isError ? 'role="alert"' : 'role="status"');
    expect(html).not.toContain(t("missionsNative.emptyTitle"));
    expect(html).not.toContain("0–0");
    expect(html).not.toContain(t("missionsNative.inPage", { value: "0" }));
  });
  it("offers a first-page escape even if reading a later page failed", () => {
    const html = render(
      language,
      createElement(MissionResults, {
        ...results,
        data: undefined,
        isError: true,
        requestedPage: 3,
      }),
    );
    expect(html).toContain(t("missionsNative.firstPage"));
    expect(html).toContain(t("missionsNative.readError"));
    expect(html).not.toContain(t("missionsNative.emptyTitle"));
  });
  it("preserves cached records with a named retry and disables stale mutation controls", () => {
    const html = render(language, createElement(MissionResults, { ...results, isError: true }));
    expect(html).toContain("Review drafts 0");
    expect(html).toContain(t("missionsNative.stale"));
    expect(html).toContain(t("missionsNative.retry"));
    expect(html).toMatch(/<select[^>]+disabled/);
  });
  it("renders the genuine empty state only for a confirmed first-page zero", () => {
    const html = render(
      language,
      createElement(MissionResults, { ...results, data: page({ total: 0 }) }),
    );
    expect(html).toContain(t("missionsNative.emptyTitle"));
    expect(html).toContain(t("missionsNative.range", { start: "0", end: "0", total: "0" }));
  });
  it("labels a zero in one filter without claiming the workspace is empty", () => {
    const html = render(
      language,
      createElement(MissionResults, { ...results, data: page({ total: 0, status: "dismissed" }) }),
    );
    expect(html).toContain(t("missionsNative.emptyFilter"));
    expect(html).not.toContain(t("missionsNative.emptyTitle"));
  });
  it("explains a page that disappeared without presenting an empty-workspace CTA", () => {
    const html = render(
      language,
      createElement(MissionResults, { ...results, data: page({ total: 1, page: 2 }) }),
    );
    expect(html).toContain(t("missionsNative.pageOutOfRange"));
    expect(html).toContain(t("missionsNative.firstPage"));
    expect(html).not.toContain(t("missionsNative.emptyTitle"));
  });
  it("shows all four states including dismissed and labels column counts as page-only", () => {
    const html = render(
      language,
      createElement(MissionBoard, {
        missions: MISSION_STATUSES.map((status, index) => mission(index, { status })),
        canEdit: false,
        canWrite: false,
        updatingId: null,
        onMove: vi.fn(),
      }),
    );
    for (const status of MISSION_STATUSES)
      expect(html).toContain(t(`missionsNative.status.${status}`));
    expect(html.match(new RegExp(t("missionsNative.inPage", { value: "1" }), "g"))).toHaveLength(4);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<select");
  });
  it("escapes saved text, keeps priority zero, renders deadlines and offers a labelled manual status control", () => {
    const html = render(
      language,
      createElement(MissionCard, {
        mission: mission(0, {
          title: "<script>saved</script>",
          priority: 0,
          due_at: "2026-11-13T01:30:00Z",
        }),
        canEdit: true,
        canWrite: true,
        isSaving: false,
        onMove: vi.fn(),
      }),
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("<dd>0</dd>");
    expect(html).toContain(t("missionsNative.manualStatus"));
    expect(html).toContain(t("missionsNative.dueAt"));
    expect(html).toContain('dateTime="2026-11-13T01:30:00Z"');
    expect(html.match(/<option/g)).toHaveLength(4);
    expect(html).toMatch(/type="submit"[^>]+disabled/);
  });
  it("displays an explicit fallback for a legacy whitespace-only title", () => {
    const html = render(
      language,
      createElement(MissionCard, {
        mission: mission(0, { title: " " }),
        canEdit: false,
        canWrite: false,
        isSaving: false,
        onMove: vi.fn(),
      }),
    );
    expect(html).toContain(t("missionsNative.untitled"));
  });
  it("offers labelled title/description/priority fields rather than an unlabelled placeholder", () => {
    const html = render(language, createElement(MissionComposer, composer));
    for (const key of ["titleLabel", "descriptionLabel", "priorityLabel"])
      expect(html).toContain(t(`missionsNative.${key}`));
    expect(html).toContain('minLength="2"');
    expect(html).toContain('maxLength="160"');
    expect(html).toContain('maxLength="2000"');
    expect(html).toContain('name="mission-title"');
    expect(html.match(/<option/g)).toHaveLength(11);
    expect(html).not.toContain(t("missionsNative.saving"));
  });
  it.each([" ", "x", "x".repeat(161)])(
    "blocks invalid normalized title without discarding it (%#)",
    (title) => {
      const html = render(
        language,
        createElement(MissionComposer, { ...composer, draft: { ...composer.draft, title } }),
      );
      expect(html).toContain('aria-invalid="true"');
      expect(html).toMatch(/type="submit" disabled/);
    },
  );
  it("blocks submit before a valid read or while another command is pending", () => {
    for (const patch of [{ canWrite: false }, { busy: true }]) {
      const html = render(language, createElement(MissionComposer, { ...composer, ...patch }));
      expect(html).toMatch(/type="submit" disabled/);
    }
  });
  it("uses a native named radio group for all statuses and the all-statuses filter", () => {
    const html = render(
      language,
      createElement(MissionFilters, { value: "dismissed", disabled: false, onChange: vi.fn() }),
    );
    expect(html).toContain("<fieldset");
    expect(html).toContain(t("missionsNative.filterLabel"));
    expect(html.match(/type="radio"/g)).toHaveLength(5);
    expect(html).toMatch(/<input(?=[^>]*value="dismissed")(?=[^>]*checked=)[^>]*>/);
  });
  it("does not confuse visible row count with a total above one thousand", () => {
    const total = new Intl.NumberFormat(language).format(1205);
    const html = render(
      language,
      createElement(MissionResults, { ...results, data: page({ total: 1205 }) }),
    );
    expect(html).toContain(t("missionsNative.range", { start: "1", end: "20", total }));
    expect(html).toContain(t("missionsNative.pageHint"));
  });
  it("keeps a confirmed save distinct from an unconfirmed event or failed follow-up read", () => {
    const html = render(
      language,
      createElement(MissionMutationFeedback, {
        ...feedbackProps,
        feedback: { kind: "created", eventMissing: true, readFailed: true },
      }),
    );
    expect(html).toContain(t("missionsNative.feedback.created"));
    expect(html).toContain(t("missionsNative.eventMissing"));
    expect(html).toContain(t("missionsNative.savedReadFailed"));
    expect(html).not.toContain(t("missionsNative.feedback.unconfirmed"));
    expect(html).toContain('role="status"');
  });
  it("requires a fresh read before offering explicit review acknowledgement", () => {
    const before = render(
      language,
      createElement(MissionMutationFeedback, {
        ...feedbackProps,
        feedback: { kind: "unconfirmed" },
        review: { refreshed: false },
      }),
    );
    expect(before).toContain('role="alert"');
    expect(before).not.toContain('type="checkbox"');
    expect(before).not.toContain(t("missionsNative.reviewResume"));
    const after = render(
      language,
      createElement(MissionMutationFeedback, {
        ...feedbackProps,
        feedback: { kind: "unconfirmed" },
        review: { refreshed: true },
      }),
    );
    expect(after).toContain(t("missionsNative.reviewReady"));
    expect(after).toContain('type="checkbox"');
    expect(after).toContain(t("missionsNative.reviewConfirm"));
  });
});

it("keeps route composition and manual commands separate from Brain/AI/legacy mutation wrappers", () => {
  const route = readFileSync(
    new URL("../../../routes/_authenticated/app.missions.tsx", import.meta.url),
    "utf8",
  );
  expect(route).toContain('modulePageHead("missions")');
  expect(route.split("\n").length).toBeLessThanOrEqual(10);
  const view = readFileSync(new URL("../MissionsPage.tsx", import.meta.url), "utf8");
  const hook = readFileSync(new URL("../hooks/use-missions-workspace.ts", import.meta.url), "utf8");
  expect(view).toContain("key={`${access.userId}:${workspaceId}`}");
  expect(hook).toContain("locked.current = true");
  expect(hook).toContain('refetchType: "none"');
  expect(hook).not.toMatch(
    /toast\.|useWorkspaceMutation|runBrain|brainSnapshot|brainAskAll|runAIInsights|localStorage/,
  );
});
it("keeps the missions PT/EN dictionaries aligned", () => {
  function keys(value: unknown, prefix = ""): string[] {
    if (!value || typeof value !== "object") return [prefix];
    return Object.entries(value)
      .flatMap(([key, nested]) => keys(nested, prefix ? `${prefix}.${key}` : key))
      .sort();
  }
  expect(keys(pt.missionsNative)).toEqual(keys(en.missionsNative));
});
