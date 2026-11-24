import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { createI18nInstance } from "@/lib/i18n";
import { assessment, operationId } from "@/lib/skill-map/__tests__/fixtures";
import { SkillMapLocationHeader } from "@/features/skill-map/SkillMapLocationHeader";
import { SkillCard } from "@/features/skill-map/components/SkillCard";
import { SkillAssessmentEditor } from "@/features/skill-map/components/SkillAssessmentEditor";
import { SkillFeedback } from "@/features/skill-map/components/SkillFeedback";
import { SkillMapReadState } from "@/features/skill-map/components/SkillMapReadState";
import { skillEditor } from "@/features/skill-map/presentation";
import { BrainLabFrame } from "../BrainLabFrame";
import { BRAIN_LAB_TABS } from "../navigation";
import pt from "@/lib/i18n/locales/pt-BR.json";
import en from "@/lib/i18n/locales/en-US.json";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    children,
    ...props
  }: {
    to: string;
    search?: { tab: string };
    children: ReactNode;
    className?: string;
  }) =>
    createElement(
      "a",
      { ...props, href: to + (search ? "?" + new URLSearchParams(search).toString() : "") },
      children,
    ),
}));
const render = (language: "pt-BR" | "en-US", child: ReactNode) =>
  renderToStaticMarkup(
    createElement(I18nextProvider, { i18n: createI18nInstance(language) }, child),
  );
const editorProps: ComponentProps<typeof SkillAssessmentEditor> = {
  editor: skillEditor("copy", assessment()),
  readReady: true,
  matches: true,
  busy: false,
  blocked: false,
  canReview: true,
  canSave: false,
  needsSave: true,
  acknowledged: false,
  onAcknowledge: vi.fn(),
  onChange: vi.fn(),
  onStep: vi.fn(),
  onSave: vi.fn(),
  onCancel: vi.fn(),
  onLoadLatest: vi.fn(),
};

for (const language of ["pt-BR", "en-US"] as const) {
  const t = createI18nInstance(language).t;
  describe(`Brain Lab semantic composition ${language}`, () => {
    it.each(BRAIN_LAB_TABS)(
      "%s has a labeled manual tablist, exactly one selected tab and one controlled panel",
      (activeTab) => {
        const html = render(
          language,
          createElement(BrainLabFrame, {
            activeTab,
            onSelect: vi.fn(),
            children: createElement("p", null, "SELECTED-CHILD"),
          }),
        );
        const tabs = [...html.matchAll(/<button\b[^>]+role="tab"[^>]*>/g)].map((m) => m[0]);
        expect(tabs).toHaveLength(7);
        expect(tabs.filter((s) => s.includes('aria-selected="true"'))).toHaveLength(1);
        expect(tabs.filter((s) => s.includes('tabindex="0"'))).toHaveLength(1);
        expect(tabs.filter((s) => s.includes("aria-controls="))).toHaveLength(1);
        const selected = tabs.find((s) => s.includes('aria-selected="true"'))!;
        expect(selected).toContain(`-tab-${activeTab}`);
        const panelId = /aria-controls="([^"]+)"/.exec(selected)![1];
        const selectedId = /\sid="([^"]+)"/.exec(selected)![1];
        expect(html).toContain(
          `role="tabpanel" id="${panelId}" aria-labelledby="${selectedId}" tabindex="0"`,
        );
        expect(html.match(/<h1\b/g)).toHaveLength(1);
        expect(html).toContain(t("brainLabNavigation.tabsLabel"));
        expect(html).toContain(t("brainLabNavigation.keyboardHint"));
        for (const tab of BRAIN_LAB_TABS)
          expect(html).toContain(t(`brainLabNavigation.tabs.${tab}`));
        expect(html.match(/SELECTED-CHILD/g)).toHaveLength(1);
        expect(html).not.toContain('type="submit"');
      },
    );
    it.each(["page", "panel"] as const)(
      "%s has the correct top heading and an explicit same-map link",
      (placement) => {
        const html = render(
          language,
          createElement(SkillMapLocationHeader, {
            placement,
            action: createElement("button", { type: "button" }, "READ-ONLY"),
          }),
        );
        expect(html).toContain(t("skillMapIntegration.sameMap"));
        expect(html).toContain(t("skillMapIntegration.runtime"));
        expect(html).toContain(
          t(placement === "panel" ? "skillMapIntegration.openPage" : "skillMapIntegration.openLab"),
        );
        expect(html).toContain(
          placement === "panel" ? 'href="/app/skill-map"' : 'href="/app/brain-lab?tab=skills"',
        );
        expect(html).toContain(placement === "panel" ? "<h2" : "<h1");
        if (placement === "panel") expect(html).not.toContain("<h1");
        expect(html).not.toContain("<form");
        expect(html).not.toContain('type="submit"');
      },
    );
    it("embedded cards use h3 and a separate ID namespace while native defaults stay h2/skill", () => {
      const html = render(
        language,
        createElement(
          "div",
          null,
          createElement(SkillCard, {
            area: "copy",
            row: assessment({ score: 0 }),
            disabled: false,
            onChoose: vi.fn(),
          }),
          createElement(SkillCard, {
            area: "copy",
            row: assessment({ score: 0 }),
            disabled: false,
            onChoose: vi.fn(),
            headingAs: "h3",
            idPrefix: "brain-lab-skill",
          }),
        ),
      );
      expect(html).toContain('<h2 id="skill-copy-title"');
      expect(html).toContain('<h3 id="brain-lab-skill-copy-title"');
      const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      expect(ids.length).toBe(new Set(ids).size);
      expect(
        html.match(
          new RegExp('aria-label="' + t("skillMapNative.declaredScore", { score: 0 }) + '"', "g"),
        ),
      ).toHaveLength(2);
    });
    it.each(["edit", "review"] as const)(
      "embedded %s editor retains labeled inputs/step identity without another h1/h2",
      (step) => {
        const html = render(
          language,
          createElement(SkillAssessmentEditor, {
            ...editorProps,
            headingAs: "h3",
            editor: { ...editorProps.editor, step },
          }),
        );
        expect(html).toContain("<h3");
        expect(html).not.toMatch(/<h[12]\b/);
        expect(html).toContain(`data-skill-step="${step}"`);
        expect(html).toContain(
          t(step === "edit" ? "skillMapNative.scoreLabel" : "skillMapNative.consent"),
        );
        const submit = /<button\b[^>]*type="submit"[^>]*>/.exec(html)![0];
        expect(/\sdisabled(?:=|\s|>)/.test(submit)).toBe(step === "review");
      },
    );
    it("embedded error/stale and outcome headings remain third level with the same recovery actions", () => {
      const error = render(
        language,
        createElement(SkillMapReadState, {
          headingAs: "h3",
          data: undefined,
          isError: true,
          isFetching: false,
          busy: false,
          onRead: vi.fn(),
          children: "NOT-CONFIRMED",
        }),
      );
      expect(error).toContain("<h3");
      expect(error).not.toContain("NOT-CONFIRMED");
      const feedback = render(
        language,
        createElement(SkillFeedback, {
          headingAs: "h3",
          operation: {
            pending: false,
            reading: false,
            reference: operationId,
            feedback: { kind: "unconfirmed", reference: operationId, readFailed: true },
            review: { refreshed: false },
          },
          receipt: null,
          readReady: true,
          confirmed: false,
          busy: false,
          onConfirm: vi.fn(),
          onRead: vi.fn(),
          onResume: vi.fn(),
        }),
      );
      expect(feedback).toContain("<h3");
      expect(feedback).not.toMatch(/<h[12]\b/);
      expect(feedback).toContain(t("skillMapNative.recoveryConsent"));
      expect(feedback).toContain(t("skillMapNative.resume"));
      expect(feedback).toContain('disabled=""');
    });
  });
}

describe("Brain Lab integration translations are static and matched, not model generation", () => {
  const flatten = (value: Record<string, unknown>, prefix = ""): Record<string, string> =>
    Object.fromEntries(
      Object.entries(value).flatMap(([key, child]): [string, string][] =>
        child !== null && typeof child === "object"
          ? Object.entries(flatten(child as Record<string, unknown>, prefix + key + "."))
          : [[prefix + key, String(child)]],
      ),
    );
  it("adds exactly fifteen matching nonempty leaves across the two new namespaces", () => {
    const a = flatten({
      brainLabNavigation: pt.brainLabNavigation,
      skillMapIntegration: pt.skillMapIntegration,
    });
    const b = flatten({
      brainLabNavigation: en.brainLabNavigation,
      skillMapIntegration: en.skillMapIntegration,
    });
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(Object.keys(a)).toHaveLength(15);
    for (const text of [...Object.values(a), ...Object.values(b)]) {
      expect(text.trim()).not.toBe("");
      expect(text).not.toMatch(/<script|TODO|undefined/i);
    }
  });
});
