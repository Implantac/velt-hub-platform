import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { createI18nInstance } from "@/lib/i18n";
import { SKILL_AREAS } from "@/lib/skill-map/contracts";
import { assessment, input, receipt, snapshot } from "@/lib/skill-map/__tests__/fixtures";
import { skillEditor } from "../presentation";
import { SkillCard } from "../components/SkillCard";
import { SkillAssessmentEditor } from "../components/SkillAssessmentEditor";
import { SkillFeedback } from "../components/SkillFeedback";
import { SkillMapReadState } from "../components/SkillMapReadState";
import pt from "@/lib/i18n/locales/pt-BR.json";
import en from "@/lib/i18n/locales/en-US.json";

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
const feedbackProps: ComponentProps<typeof SkillFeedback> = {
  operation: { pending: false, reading: false, reference: null, feedback: null, review: null },
  receipt: null,
  readReady: true,
  confirmed: false,
  busy: false,
  onConfirm: vi.fn(),
  onRead: vi.fn(),
  onResume: vi.fn(),
};
const readProps: ComponentProps<typeof SkillMapReadState> = {
  data: undefined,
  isError: false,
  isFetching: true,
  busy: false,
  onRead: vi.fn(),
  children: createElement("p", null, "CONFIRMED-MAP"),
};
const render = (language: "pt-BR" | "en-US", node: ReactNode) =>
  renderToStaticMarkup(
    createElement(I18nextProvider, { i18n: createI18nInstance(language) }, node),
  );
const disabledButton = (html: string, label: string) =>
  [...html.matchAll(/<button\b[^>]*>[^<]*<\/button>/g)].some(
    (m) => m[0].includes(`>${label}</button>`) && m[0].includes('disabled=""'),
  );

describe.each(["pt-BR", "en-US"] as const)("Skill Map accessible honest markup %s", (language) => {
  const t = createI18nInstance(language).t;
  it("first loading does not show empty counts or unconfirmed private children", () => {
    const html = render(language, createElement(SkillMapReadState, readProps));
    expect(html).toContain('role="status"');
    expect(html).toContain(t("skillMapNative.loading"));
    expect(html).not.toContain("CONFIRMED-MAP");
    expect(html).not.toContain(t("skillMapNative.empty"));
  });
  it("first failure offers only a read retry, never an empty map", () => {
    const html = render(
      language,
      createElement(SkillMapReadState, { ...readProps, isError: true, isFetching: false }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(t("skillMapNative.refresh"));
    expect(html).not.toContain("CONFIRMED-MAP");
    expect(html).not.toContain(t("skillMapNative.empty"));
  });
  it("confirmed empty data is identified honestly and still permits the ten-area presentation", () => {
    const html = render(
      language,
      createElement(SkillMapReadState, {
        ...readProps,
        data: snapshot({ total: 0, items: [] }),
        isFetching: false,
      }),
    );
    expect(html).toContain(t("skillMapNative.empty"));
    expect(html).toContain("CONFIRMED-MAP");
  });
  it("stale reads preserve cached data under an independent warning and fetching state", () => {
    const html = render(
      language,
      createElement(SkillMapReadState, { ...readProps, data: snapshot(), isError: true }),
    );
    expect(html).toContain("CONFIRMED-MAP");
    expect(html).toContain(t("skillMapNative.stale"));
    expect(html).toContain(t("skillMapNative.reading"));
    expect(disabledButton(html, t("skillMapNative.refresh"))).toBe(true);
  });
  it("unassessed is a dash, not a zero or a mastery claim", () => {
    const html = render(
      language,
      createElement(SkillCard, { area: "copy", row: null, disabled: false, onChoose: vi.fn() }),
    );
    expect(html).toContain(t("skillMapNative.bands.unassessed"));
    expect(html).toContain("—");
    expect(html).not.toContain('aria-label="' + t("skillMapNative.declaredScore", { score: 0 }));
    expect(html).not.toContain("<input");
    expect(html).toContain(t("skillMapNative.noAssessment"));
  });
  it.each([0, 29, 30, 79, 80, 100])(
    "score %s remains explicit, with original date and a labeled native action",
    (score) => {
      const html = render(
        language,
        createElement(SkillCard, {
          area: "copy",
          row: assessment({ score }),
          disabled: false,
          onChoose: vi.fn(),
        }),
      );
      expect(html).toContain(t("skillMapNative.declaredScore", { score }));
      expect(html).toContain(`>${score}</span>`);
      expect(html).toContain(language === "pt-BR" ? "20:30" : "8:30");
      if (language === "en-US") expect(html).toContain("PM");
      expect(html).toContain('type="button"');
      expect(html).toContain(
        t("skillMapNative.chooseArea", { area: t("skillMapNative.areas.copy.label") }),
      );
    },
  );
  it("preserves escaped original source/notes/evidence and uncalibrated confidence without executable URLs or HTML", () => {
    const row = assessment({
      source: "<script>source</script>",
      confidence: 1.75,
      notes: "<img src=x onerror=unsafe>".repeat(30),
      evidence: [false, { url: "javascript:unsafe", text: "<svg onload=unsafe>" }],
    });
    const html = render(
      language,
      createElement(SkillCard, { area: "copy", row, disabled: true, onChoose: vi.fn() }),
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("1.75");
    expect(html).toContain(t("skillMapNative.technicalHint"));
    expect(disabledButton(html, t("skillMapNative.edit"))).toBe(true);
  });
  it("keeps an original empty notes string distinct from null", () => {
    const html = render(
      language,
      createElement(SkillCard, {
        area: "copy",
        row: assessment({ notes: "" }),
        disabled: false,
        onChoose: vi.fn(),
      }),
    );
    expect(html).toContain(t("skillMapNative.originalEmptyNotes"));
  });
  it("keeps distinct step forms and a non-submit back control", () => {
    const editHtml = render(language, createElement(SkillAssessmentEditor, editorProps));
    const reviewHtml = render(
      language,
      createElement(SkillAssessmentEditor, {
        ...editorProps,
        editor: { ...editorProps.editor, step: "review" },
      }),
    );
    expect(editHtml).toContain('data-skill-step="edit"');
    expect(reviewHtml).toContain('data-skill-step="review"');
    expect(reviewHtml).toContain('type="button"');
    expect(reviewHtml).toContain(t("skillMapNative.backToEdit"));
  });
  it("edits through labeled keyboard-native inputs and explicit review, without an autosaving slider", () => {
    const html = render(language, createElement(SkillAssessmentEditor, editorProps));
    expect(html).toContain('type="number"');
    expect(html).toContain('min="0"');
    expect(html).toContain('max="100"');
    expect(html).toContain('step="1"');
    expect(html).toContain('value="45"');
    expect(html).toContain('maxLength="500"');
    expect(html).toContain("aria-describedby=");
    expect(html).toContain('tabindex="-1"');
    expect(html).not.toContain('type="range"');
    expect(html).toContain(t("skillMapNative.review"));
    expect(html).not.toContain(t("skillMapNative.save"));
  });
  it("preserves an oversized original draft and asks for deliberate revision instead of silently truncating", () => {
    const row = assessment({ score: 0, notes: "original ".repeat(70) });
    const html = render(
      language,
      createElement(SkillAssessmentEditor, {
        ...editorProps,
        editor: skillEditor("copy", row),
        canReview: false,
      }),
    );
    expect(html).toContain(row.notes!);
    expect(html).toContain('value="0"');
    expect(html).toContain(t("skillMapNative.invalidDraft"));
    expect(disabledButton(html, t("skillMapNative.review"))).toBe(true);
  });
  it("review separates the observed score, new score, replacement effect and unchecked consent", () => {
    const html = render(
      language,
      createElement(SkillAssessmentEditor, {
        ...editorProps,
        editor: {
          ...skillEditor("copy", assessment({ source: "inferred" })),
          score: "0",
          step: "review",
        },
      }),
    );
    expect(html).toContain(t("skillMapNative.beforeScore"));
    expect(html).toContain(t("skillMapNative.afterScore"));
    expect(html).toContain(t("skillMapNative.replacementHint"));
    expect(html).toContain(t("skillMapNative.preservedMetadataHint"));
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('checked=""');
    expect(disabledButton(html, t("skillMapNative.save"))).toBe(true);
    expect(html).toContain("inferred");
  });
  it("a new self-report declares technical defaults without a fabricated previous zero", () => {
    const html = render(
      language,
      createElement(SkillAssessmentEditor, {
        ...editorProps,
        editor: { ...skillEditor("copy", null), score: "0", step: "review" },
      }),
    );
    expect(html).toContain(t("skillMapNative.bands.unassessed"));
    expect(html).toContain(t("skillMapNative.newMetadataHint"));
  });
  it("changed base needs explicit draft replacement and an invalid read does not allow review", () => {
    const html = render(
      language,
      createElement(SkillAssessmentEditor, { ...editorProps, matches: false, canReview: false }),
    );
    expect(html).toContain(t("skillMapNative.baseChanged"));
    expect(html).toContain(t("skillMapNative.loadLatest"));
    expect(disabledButton(html, t("skillMapNative.review"))).toBe(true);
    const reading = render(
      language,
      createElement(SkillAssessmentEditor, { ...editorProps, readReady: false, canReview: false }),
    );
    expect(reading).toContain(t("skillMapNative.reviewReadRequired"));
  });
  it("unchanged self fields do not invite another save", () => {
    const html = render(
      language,
      createElement(SkillAssessmentEditor, {
        ...editorProps,
        editor: { ...editorProps.editor, step: "review" },
        needsSave: false,
      }),
    );
    expect(html).toContain(t("skillMapNative.noChange"));
    expect(disabledButton(html, t("skillMapNative.save"))).toBe(true);
  });
  it("pending/uncertain state disables editor actions, including cancel", () => {
    const html = render(
      language,
      createElement(SkillAssessmentEditor, { ...editorProps, busy: true }),
    );
    expect(html).toContain('disabled=""');
    expect(disabledButton(html, t("skillMapNative.discard"))).toBe(true);
  });
  it("a pending write has a status message, never a success claim", () => {
    const html = render(
      language,
      createElement(SkillFeedback, {
        ...feedbackProps,
        operation: { ...feedbackProps.operation, pending: true },
      }),
    );
    expect(html).toContain(t("skillMapNative.savingHint"));
    expect(html).not.toContain(t("skillMapNative.feedback.saved"));
  });
  it("primary success survives a reread failure and shows the confirmed receipt separately", () => {
    const html = render(
      language,
      createElement(SkillFeedback, {
        ...feedbackProps,
        receipt: receipt(input()),
        operation: {
          ...feedbackProps.operation,
          reference: "op-safe",
          feedback: { kind: "saved", reference: "op-safe", readFailed: true },
        },
      }),
    );
    expect(html).toContain(t("skillMapNative.feedback.saved"));
    expect(html).toContain(t("skillMapNative.savedReadWarning"));
    expect(html).toContain("op-safe");
    expect(html).not.toContain(t("skillMapNative.feedback.unconfirmed"));
  });
  it("uncertainty requires a valid deliberate read and human acknowledgement, not retrying POST", () => {
    const html = render(
      language,
      createElement(SkillFeedback, {
        ...feedbackProps,
        operation: {
          ...feedbackProps.operation,
          reference: "op-safe",
          feedback: { kind: "unconfirmed", reference: "op-safe", readFailed: true },
          review: { refreshed: false },
        },
      }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(t("skillMapNative.uncertainHint"));
    expect(html).toContain(t("skillMapNative.recoveryConsent"));
    expect(disabledButton(html, t("skillMapNative.resume"))).toBe(true);
    expect(html).toContain('type="checkbox" disabled=""');
  });
  it("human recovery only enables discarding the uncertain draft after a confirmed read", () => {
    const html = render(
      language,
      createElement(SkillFeedback, {
        ...feedbackProps,
        confirmed: true,
        operation: {
          ...feedbackProps.operation,
          feedback: { kind: "unconfirmed", reference: "op-safe", readFailed: true },
          review: { refreshed: true },
        },
      }),
    );
    expect(disabledButton(html, t("skillMapNative.resume"))).toBe(false);
    expect(html).toContain('checked=""');
  });
  it("all ten area labels/hints exist in the chosen language without translation-key fallback", () => {
    for (const area of SKILL_AREAS) {
      const html = render(
        language,
        createElement(SkillCard, { area, row: null, disabled: false, onChoose: vi.fn() }),
      );
      expect(html).not.toContain("skillMapNative.");
      expect(html).toContain(t(`skillMapNative.areas.${area}.label`));
      expect(html).toContain(t(`skillMapNative.areas.${area}.hint`));
    }
  });
});
it("adds the same 99 static translation leaves in both languages", () => {
  const leaves = (value: Record<string, unknown>, prefix = ""): string[] =>
    Object.entries(value).flatMap(([key, child]) =>
      child && typeof child === "object"
        ? leaves(child as Record<string, unknown>, `${prefix}${key}.`)
        : [`${prefix}${key}`],
    );
  expect(leaves(pt.skillMapNative).sort()).toEqual(leaves(en.skillMapNative).sort());
  expect(leaves(pt.skillMapNative)).toHaveLength(99);
});
