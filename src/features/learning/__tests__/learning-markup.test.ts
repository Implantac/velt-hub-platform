import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { createI18nInstance } from "@/lib/i18n";
import {
  at,
  batch,
  input,
  learningPath,
  page,
  progress,
  receipt,
} from "@/lib/learning/__tests__/fixtures";
import { learningCatalogVersion } from "@/lib/learning/contracts";
import { LearningPathCard } from "../components/LearningPathCard";
import { LearningConfirmation } from "../components/LearningConfirmation";
import { LearningFeedback } from "../components/LearningFeedback";
import { LearningReadState } from "../components/LearningReadState";
import { LearningPagination } from "../components/LearningPagination";
import type { LearningIntent } from "../presentation";
import pt from "@/lib/i18n/locales/pt-BR.json";
import en from "@/lib/i18n/locales/en-US.json";
const intent: LearningIntent = { ...input(), observedPath: learningPath() };
const confirmProps: ComponentProps<typeof LearningConfirmation> = {
  intent,
  matches: true,
  readReady: true,
  pending: false,
  blocked: false,
  acknowledged: false,
  canSave: false,
  onAcknowledge: vi.fn(),
  onSave: vi.fn(),
  onCancel: vi.fn(),
};
const state: ComponentProps<typeof LearningReadState> = {
  data: undefined,
  catalogError: false,
  progressError: false,
  progressConfirmed: false,
  fetching: true,
  onRead: vi.fn(),
  children: createElement("p", null, "PRIVATE-CATALOG"),
};
const feedback: ComponentProps<typeof LearningFeedback> = {
  operation: { pending: false, reading: false, reference: null, feedback: null, review: null },
  receipt: null,
  readReady: true,
  confirmed: false,
  onConfirm: vi.fn(),
  onRead: vi.fn(),
  onResume: vi.fn(),
  busy: false,
};
function render(language: "pt-BR" | "en-US", node: ReactNode) {
  return renderToStaticMarkup(
    createElement(I18nextProvider, { i18n: createI18nInstance(language) }, node),
  );
}
const disabledButton = (html: string, label: string) =>
  [...html.matchAll(/<button\b[^>]*>[^<]*<\/button>/g)].some(
    (m) => m[0].includes(`>${label}</button>`) && m[0].includes('disabled=""'),
  );
describe.each(["pt-BR", "en-US"] as const)("Learning accessible markup %s", (language) => {
  const t = createI18nInstance(language).t;
  it("loading is not an empty catalog and hides unconfirmed children", () => {
    const html = render(language, createElement(LearningReadState, state));
    expect(html).toContain('role="status"');
    expect(html).toContain(t("learningNative.catalogLoading"));
    expect(html).not.toContain("PRIVATE-CATALOG");
    expect(html).not.toContain(t("learningNative.catalogEmpty"));
  });
  it("first catalog error has a GET retry, not a false empty state or cached content", () => {
    const html = render(
      language,
      createElement(LearningReadState, { ...state, catalogError: true, fetching: false }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(t("learningNative.retry"));
    expect(html).not.toContain("PRIVATE-CATALOG");
  });
  it("keeps earlier catalog/progress under separate stale warnings", () => {
    const html = render(
      language,
      createElement(LearningReadState, {
        ...state,
        data: page(),
        catalogError: true,
        progressError: true,
        progressConfirmed: true,
      }),
    );
    expect(html).toContain("PRIVATE-CATALOG");
    expect(html).toContain(t("learningNative.catalogStale"));
    expect(html).toContain(t("learningNative.progressStale"));
    expect(html).toContain('aria-busy="true"');
  });
  it("does not declare absence on a first progress error", () => {
    const html = render(
      language,
      createElement(LearningReadState, { ...state, data: page(), progressError: true }),
    );
    expect(html).toContain(t("learningNative.progressError"));
    expect(html).not.toContain(t("learningNative.noProgress"));
  });
  it("distinguishes a confirmed empty catalog from a disappeared page", () => {
    const empty = render(
      language,
      createElement(LearningReadState, {
        ...state,
        data: page({ total: 0, items: [] }),
        fetching: false,
      }),
    );
    expect(empty).toContain(t("learningNative.catalogEmpty"));
    const gone = render(
      language,
      createElement(LearningReadState, {
        ...state,
        data: page({ total: 1, page: 2, items: [] }),
        fetching: false,
      }),
    );
    expect(gone).toContain(t("learningNative.pageGone"));
    expect(gone).not.toContain(t("learningNative.catalogEmpty"));
  });
  it("does not invent zero progress while marks are unconfirmed", () => {
    const html = render(
      language,
      createElement(LearningPathCard, {
        path: learningPath(),
        progress: undefined,
        disabled: true,
        onChoose: vi.fn(),
      }),
    );
    expect(html).toContain(t("learningNative.progressUnconfirmed"));
    expect(html).not.toContain("<progress");
    expect(html).not.toContain(t("learningNative.noProgress"));
    expect(html.match(/<button[^>]*disabled/g)).toHaveLength(2);
  });
  it("shows a confirmed absence as zero and uses named native pressed-state buttons/progress", () => {
    const html = render(
      language,
      createElement(LearningPathCard, {
        path: learningPath(),
        progress: null,
        disabled: false,
        onChoose: vi.fn(),
      }),
    );
    expect(html).toContain(t("learningNative.noProgress"));
    expect(html).toContain('value="0"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="' + t("learningNative.progressLabel"));
    expect(html.match(/type="button"/g)).toHaveLength(2);
    expect(html).toContain('aria-hidden="true"');
  });
  it("preserves original text/unknown IDs/legacy percentage without unsafe HTML or hidden resetting", () => {
    const path = learningPath({ title: "Original <script>not-code</script>" });
    const p = progress({ completed_milestones: ["first", "<img onerror=not-code>"] });
    const html = render(
      language,
      createElement(LearningPathCard, { path, progress: p, disabled: false, onChoose: vi.fn() }),
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("175%");
    expect(html).toContain('value="50"');
    expect(html).toContain(t("learningNative.legacyPercent"));
    expect(html).toContain(t("learningNative.unknownIds", { count: 1 }));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("11:00");
  });
  it("does not offer actions for a path with no milestones", () => {
    const html = render(
      language,
      createElement(LearningPathCard, {
        path: learningPath({ milestones: [] }),
        progress: null,
        disabled: false,
        onChoose: vi.fn(),
      }),
    );
    expect(html).toContain(t("learningNative.noMilestones"));
    expect(html).not.toContain("<button");
  });
  it("previews the new known ratio and preservation before an unchecked explicit consent", () => {
    const html = render(language, createElement(LearningConfirmation, confirmProps));
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain(t("learningNative.confirmTitle"));
    expect(html).toContain(t("learningNative.preview", { done: 2, total: 2, percent: 100 }));
    expect(html).toContain(t("learningNative.preserveUnknown", { count: 1 }));
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('checked=""');
    expect(html).toContain(t("learningNative.effects"));
    expect(disabledButton(html, t("learningNative.save"))).toBe(true);
  });
  it("blocks consent for stale/changed bases, preserving the original chosen labels", () => {
    const changed = render(
      language,
      createElement(LearningConfirmation, { ...confirmProps, matches: false }),
    );
    expect(changed).toContain(t("learningNative.changedBase"));
    expect(changed).toMatch(/<input[^>]*disabled/);
    expect(changed).toContain("Catálogo original");
    const stale = render(
      language,
      createElement(LearningConfirmation, { ...confirmProps, readReady: false }),
    );
    expect(stale).toContain(t("learningNative.confirmReadRequired"));
    expect(stale).toMatch(/<input[^>]*disabled/);
  });
  it("pending/uncertain operations cannot be cancelled into an automatic replay", () => {
    for (const patch of [{ pending: true }, { blocked: true }]) {
      const html = render(
        language,
        createElement(LearningConfirmation, { ...confirmProps, ...patch }),
      );
      expect(disabledButton(html, t("learningNative.cancel"))).toBe(true);
      expect(html).toMatch(/<input[^>]*disabled/);
    }
  });
  it("keeps confirmed save primary with a distinct reread warning and receipt time", () => {
    const html = render(
      language,
      createElement(LearningFeedback, {
        ...feedback,
        receipt: receipt(),
        operation: {
          ...feedback.operation,
          feedback: { kind: "saved", reference: "op-ref", readFailed: true },
        },
      }),
    );
    expect(html).toContain(t("learningNative.feedback.saved"));
    expect(html).toContain(t("learningNative.savedReadFailed"));
    expect(html).toContain("12:00");
    expect(html).not.toContain(t("learningNative.reviewTitle"));
  });
  it("uncertainty asks for GET and human review; a flag alone does not unlock writes", () => {
    const operation = {
      ...feedback.operation,
      feedback: { kind: "unconfirmed" as const, reference: "op-ref", readFailed: true },
      review: { refreshed: false },
    };
    const html = render(language, createElement(LearningFeedback, { ...feedback, operation }));
    expect(html).toContain(t("learningNative.feedback.unconfirmed"));
    expect(html).toContain(t("learningNative.reviewRead"));
    expect(html).not.toContain('type="checkbox"');
    expect(disabledButton(html, t("learningNative.reviewResume"))).toBe(true);
    const fresh = render(
      language,
      createElement(LearningFeedback, {
        ...feedback,
        operation: { ...operation, review: { refreshed: true } },
      }),
    );
    expect(fresh).toContain('type="checkbox"');
    expect(fresh).not.toContain('checked=""');
    expect(disabledButton(fresh, t("learningNative.reviewResume"))).toBe(true);
  });
  it("announces exact catalog totals and offers explicit recovery from a vanished page", () => {
    const html = render(
      language,
      createElement(LearningPagination, {
        data: page({ page: 3, total: 2, items: [] }),
        disabled: false,
        onPage: vi.fn(),
      }),
    );
    expect(html).toContain(t("learningNative.pageCount", { page: 3, pages: 1, total: 2 }));
    expect(html).toContain(t("learningNative.firstPage"));
    expect(disabledButton(html, t("learningNative.previous"))).toBe(true);
    expect(disabledButton(html, t("learningNative.next"))).toBe(true);
  });
});
function leaves(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, item]) =>
    typeof item === "object" && item !== null ? leaves(item, prefix + key + ".") : [prefix + key],
  );
}
it("ships matching complete Learning UI translation keys in PT and EN", () => {
  expect(leaves(pt.learningNative).sort()).toEqual(leaves(en.learningNative).sort());
  expect(leaves(pt.learningNative)).toHaveLength(65);
});
