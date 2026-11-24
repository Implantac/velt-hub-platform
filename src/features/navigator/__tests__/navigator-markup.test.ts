import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createI18nInstance } from "@/lib/i18n";
import en from "@/lib/i18n/locales/en-US.json";
import pt from "@/lib/i18n/locales/pt-BR.json";
import { legacy, profile, revisionId } from "@/lib/navigator/__tests__/fixtures";
import { navigatorDraft, navigatorDraftSchema } from "../presentation";
import { DiagnosticSteps } from "../components/DiagnosticSteps";
import { ProfileEditor } from "../components/ProfileEditor";
import { ProfileSummary } from "../components/ProfileSummary";
import { ProfileReadState } from "../components/ProfileReadState";
import { ProfileVersionConflict } from "../components/ProfileVersionConflict";
import { ProfileFeedback } from "../components/ProfileFeedback";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) =>
    createElement("a", { ...props, href: to }, children),
}));
function render(language: "pt-BR" | "en-US", node: ReactNode) {
  return renderToStaticMarkup(
    createElement(I18nextProvider, { i18n: createI18nInstance(language) }, node),
  );
}
const editor: ComponentProps<typeof ProfileEditor> = {
  form: navigatorDraft(profile()),
  step: 1,
  invalidFields: [],
  disabled: false,
  confirmationDisabled: false,
  canSave: false,
  needsSave: true,
  acknowledged: false,
  onAcknowledge: vi.fn(),
  onChange: vi.fn(),
  onStep: vi.fn(),
  onSave: vi.fn(),
  onCancel: vi.fn(),
};
const feedback: ComponentProps<typeof ProfileFeedback> = {
  operation: { pending: false, feedback: null, review: null },
  confirmed: false,
  onConfirm: vi.fn(),
  onRefresh: vi.fn(),
  onResume: vi.fn(),
  busy: false,
  readReady: true,
};
const state = {
  data: undefined,
  isError: false,
  isFetching: true,
  busy: false,
  onRetry: vi.fn(),
  children: createElement("p", null, "PRIVATE-READ"),
};
function button(html: string, name: string) {
  return [...html.matchAll(/<button\b[^>]*>[^<]*<\/button>/g)]
    .map((m) => m[0])
    .find((s) => s.endsWith(`>${name}</button>`));
}

describe.each(["pt-BR", "en-US"] as const)("Navigator markup in %s", (language) => {
  const t = createI18nInstance(language).t;
  it("does not show cached content or confirmed absence while the first personal read is pending", () => {
    const html = render(language, createElement(ProfileReadState, state));
    expect(html).toContain(t("navigatorNative.loading"));
    expect(html).not.toContain("PRIVATE-READ");
    expect(html).not.toContain(t("navigatorNative.emptyTitle"));
  });
  it("shows a retryable first-read error rather than an empty profile", () => {
    const html = render(
      language,
      createElement(ProfileReadState, { ...state, isError: true, isFetching: false }),
    );
    expect(html).toContain(t("navigatorNative.readError"));
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("PRIVATE-READ");
    expect(html).toContain(t("navigatorNative.retry"));
  });
  it("keeps an earlier profile under a stale warning, and labels a background reread", () => {
    const html = render(
      language,
      createElement(ProfileReadState, { ...state, data: profile(), isError: true }),
    );
    expect(html).toContain("PRIVATE-READ");
    expect(html).toContain(t("navigatorNative.stale"));
    expect(html).toContain(t("navigatorNative.reading"));
    expect(html).toContain('aria-busy="true"');
  });
  it("provides a working Continue control on the first question, native radios and an announced current step", () => {
    const html = render(language, createElement(ProfileEditor, editor));
    expect(button(html, t("navigatorNative.next"))).not.toContain('disabled=""');
    expect(button(html, t("navigatorNative.previous"))).toContain('disabled=""');
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain(t("navigatorNative.draftHint"));
    expect(html).not.toContain(t("navigatorNative.saveAcknowledge"));
  });
  it("offers a real unspecified activity instead of overwriting a nullable saved choice", () => {
    const html = render(
      language,
      createElement(DiagnosticSteps, {
        step: 2,
        form: navigatorDraft(profile()),
        onChange: vi.fn(),
        disabled: false,
        invalidFields: [],
      }),
    );
    expect(html.match(/type="radio"/g)).toHaveLength(9);
    expect(html).toContain(t("navigatorNative.unspecified"));
    expect(html).toMatch(/<input(?=[^>]*value="unspecified")(?=[^>]*checked="")[^>]*>/);
  });
  it("prefills known and unknown goals with named native checkboxes, escaping original text", () => {
    const form = navigatorDraft(
      legacy({ goals: ["Primeiros clientes", "Original <script>not-code</script>"] }),
    );
    const html = render(
      language,
      createElement(DiagnosticSteps, {
        step: 3,
        form,
        onChange: vi.fn(),
        disabled: false,
        invalidFields: [],
      }),
    );
    expect(html.match(/type="checkbox"/g)).toHaveLength(9);
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html).toContain(t("navigatorNative.goals.firstClients"));
    expect(html).toContain(t("navigatorNative.originalChoice"));
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("names full-range numeric inputs and preserves previous values rather than capping sliders", () => {
    const html = render(
      language,
      createElement(DiagnosticSteps, {
        step: 4,
        form: navigatorDraft(
          legacy({ time_budget_hours_week: 120, money_budget_monthly: 900000.45 }),
        ),
        onChange: vi.fn(),
        disabled: false,
        invalidFields: [],
      }),
    );
    expect(html).toContain(t("navigatorNative.fields.time_budget_hours_week"));
    expect(html).toContain(t("navigatorNative.fields.money_budget_monthly"));
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('inputMode="decimal"');
    expect(html).toContain('value="120"');
    expect(html).toContain('value="900000.45"');
    expect(html).not.toContain('type="range"');
    expect(html.match(/aria-describedby=/g)).toHaveLength(2);
  });
  it("marks invalid numerical input without silently modifying it or allowing Continue", () => {
    const html = render(
      language,
      createElement(ProfileEditor, {
        ...editor,
        step: 4,
        form: { ...editor.form, time_budget_hours_week: "200" },
        invalidFields: ["time_budget_hours_week"],
      }),
    );
    expect(html).toContain('value="200"');
    expect(html).toContain('aria-invalid="true"');
    expect(button(html, t("navigatorNative.next"))).toContain('disabled=""');
  });
  it("labels optional channels as preferences, not connected accounts", () => {
    const html = render(
      language,
      createElement(DiagnosticSteps, {
        step: 5,
        form: navigatorDraft(
          profile({}, { preferred_channels: ["YouTube"], content_preferences: ["Newsletter"] }),
        ),
        onChange: vi.fn(),
        disabled: false,
        invalidFields: [],
      }),
    );
    expect(html).toContain(t("navigatorNative.channelHint"));
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html).toContain("YouTube");
    expect(html).toContain("Newsletter");
  });
  it("requires a separate unchecked acknowledgement before the final save and makes all effects visible", () => {
    const html = render(language, createElement(ProfileEditor, { ...editor, step: 6 }));
    expect(button(html, t("navigatorNative.save"))).toContain('disabled=""');
    expect(html).toContain(t("navigatorNative.saveEffects"));
    expect(html).toContain(t("navigatorNative.saveAcknowledge"));
    expect(html).not.toContain('checked=""');
  });
  it("previews canonical normalized answers and explicitly explains normalization, leaving the original draft intact", () => {
    const form = navigatorDraft(legacy({ goals: [" Custom ", "Custom"] })),
      reviewAnswers = navigatorDraftSchema.parse(form);
    const html = render(
      language,
      createElement(ProfileEditor, { ...editor, step: 6, form, reviewAnswers }),
    );
    expect(html).toContain(t("navigatorNative.normalizationHint"));
    expect(form.goals).toEqual([" Custom ", "Custom"]);
    expect(html).not.toContain(" Custom ");
  });
  it("does not offer a redundant write for an unchanged native version", () => {
    const html = render(
      language,
      createElement(ProfileEditor, { ...editor, step: 6, needsSave: false }),
    );
    expect(html).toContain(t("navigatorNative.noChanges"));
    expect(button(html, t("navigatorNative.save"))).toContain('disabled=""');
  });
  it("disables editing/navigation during an in-flight write and confirmation during stale reads", () => {
    const pending = render(language, createElement(ProfileEditor, { ...editor, disabled: true }));
    expect(pending.match(/<input[^>]*disabled/g)).toHaveLength(3);
    expect(button(pending, t("navigatorNative.next"))).toContain('disabled=""');
    expect(button(pending, t("navigatorNative.cancel"))).toContain('disabled=""');
    const stale = render(
      language,
      createElement(ProfileEditor, { ...editor, step: 6, confirmationDisabled: true }),
    );
    expect(stale).toMatch(/<input[^>]*type="checkbox"[^>]*disabled/);
  });
  it("translates native actions and choices, shows São Paulo dates, version and inspectable rule limits", () => {
    const row = profile(),
      html = render(
        language,
        createElement(ProfileSummary, { profile: row, onRetake: vi.fn(), canEdit: true }),
      );
    expect(html).toContain(t("navigatorNative.actions.reviewBrand"));
    expect(html).toContain(t("navigatorNative.goals.firstClients"));
    expect(html).toContain(t("navigatorNative.methodHint"));
    expect(html).toContain(t("navigatorNative.compatibilityHint"));
    expect(html).toContain("velt-navigator-v2");
    expect(html).toContain(revisionId);
    expect(html).toContain("<time ");
    expect(html).toContain("12:00");
    expect(html).toContain("America/Sao_Paulo");
    expect(html).toContain('href="/app/brands"');
    expect(html).toContain("aria-label=");
    if (language === "en-US") expect(html).not.toContain("Revisar o cadastro da sua marca");
  });
  it("preserves escaped legacy actions and unknown choices while dropping unsafe navigation", () => {
    const html = render(
      language,
      createElement(ProfileSummary, {
        profile: legacy({ goals: ["Original <img src=x>"], preferred_channels: ["Old network"] }),
        onRetake: vi.fn(),
        canEdit: false,
      }),
    );
    expect(html).toContain(t("navigatorNative.legacyHint"));
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x&gt;");
    expect(html).toContain("Old network");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<script>");
    expect(button(html, t("navigatorNative.edit"))).toContain('disabled=""');
    expect(html).toContain("overflow-wrap:anywhere");
  });
  it("does not hide a large legacy list behind an unlabeled partial preview", () => {
    const recommended_actions = Array.from({ length: 24 }, (_, n) => ({
      title: `Earlier ${n}`,
      href: "/app/content",
    }));
    const html = render(
      language,
      createElement(ProfileSummary, {
        profile: legacy({ recommended_actions }),
        onRetake: vi.fn(),
        canEdit: true,
      }),
    );
    expect(html).toContain(t("navigatorNative.legacyPreview", { count: 20, total: 24 }));
    expect(html.match(/href="\/app\/content"/g)).toHaveLength(20);
  });
  it("offers explicit discard/load or preserve/rebase choices when a version changed; never prechecks rebase", () => {
    const html = render(
      language,
      createElement(ProfileVersionConflict, {
        current: profile(),
        confirmed: false,
        onConfirm: vi.fn(),
        onLoad: vi.fn(),
        onAdopt: vi.fn(),
        disabled: false,
        canAdopt: true,
      }),
    );
    expect(html).toContain(t("navigatorNative.versionHint"));
    expect(html).toContain(t("navigatorNative.loadLatest"));
    expect(button(html, t("navigatorNative.adoptLatest"))).toContain('disabled=""');
    expect(html).not.toContain('checked=""');
    expect(html).toContain(t("navigatorNative.currentRead"));
    expect(html).toContain(revisionId);
    expect(html).toContain("12:00");
    expect(html).toContain("<time ");
  });
  it("reports a currently absent profile in the conflict comparison without claiming a failed read is absence", () => {
    const html = render(
      language,
      createElement(ProfileVersionConflict, {
        current: null,
        confirmed: true,
        onConfirm: vi.fn(),
        onLoad: vi.fn(),
        onAdopt: vi.fn(),
        disabled: false,
        canAdopt: false,
      }),
    );
    expect(html).toContain(t("navigatorNative.currentAbsent"));
    expect(button(html, t("navigatorNative.adoptLatest"))).toContain('disabled=""');
  });
  it("announces uncertainty with a reference and no automatic-retry control or early review acknowledgement", () => {
    const html = render(
      language,
      createElement(ProfileFeedback, {
        ...feedback,
        operation: {
          pending: false,
          feedback: { kind: "unconfirmed", reference: revisionId },
          review: { refreshed: false },
        },
      }),
    );
    expect(html).toContain(t("navigatorNative.feedback.unconfirmed"));
    expect(html).toContain(revisionId);
    expect(html).toContain(t("navigatorNative.reviewRefresh"));
    expect(html).not.toContain(t("navigatorNative.reviewConfirm"));
    expect(html).not.toContain(t("navigatorNative.save"));
    expect(html).toContain('role="alert"');
  });
  it("requires fresh read and an unchecked human review confirmation before allowing a future decision", () => {
    const html = render(
      language,
      createElement(ProfileFeedback, {
        ...feedback,
        operation: {
          pending: false,
          feedback: { kind: "unconfirmed" },
          review: { refreshed: true },
        },
      }),
    );
    expect(html).toContain(t("navigatorNative.reviewConfirm"));
    expect(html).not.toContain('checked=""');
    expect(button(html, t("navigatorNative.reviewResume"))).toContain('disabled=""');
  });
  it("separates a confirmed save from its failed reread", () => {
    const html = render(
      language,
      createElement(ProfileFeedback, {
        ...feedback,
        operation: {
          pending: false,
          feedback: { kind: "saved", readFailed: true, reference: revisionId },
          review: null,
        },
      }),
    );
    expect(html).toContain(t("navigatorNative.feedback.saved"));
    expect(html).toContain(t("navigatorNative.savedReadFailed"));
    expect(html).not.toContain(t("navigatorNative.feedback.unconfirmed"));
    expect(html).not.toContain(t("navigatorNative.reviewRefresh"));
  });
  it("announces pending writes and produces no invented feedback when idle", () => {
    const pending = render(
      language,
      createElement(ProfileFeedback, {
        ...feedback,
        operation: { pending: true, feedback: null, review: null },
      }),
    );
    expect(pending).toContain(t("navigatorNative.saving"));
    expect(pending).toContain('role="status"');
    expect(render(language, createElement(ProfileFeedback, feedback))).toBe("");
  });
});

function leaves(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === "object" && child !== null
      ? leaves(child, prefix + key + ".")
      : [prefix + key],
  );
}
describe("Navigator composition and translation boundaries", () => {
  it("ships complete matched PT/EN namespaces with nonempty text", () => {
    expect(leaves(pt.navigatorNative).sort()).toEqual(leaves(en.navigatorNative).sort());
    for (const language of ["pt-BR", "en-US"] as const) {
      const t = createI18nInstance(language).t;
      for (const key of leaves(pt.navigatorNative))
        expect(t(`navigatorNative.${key}`)).not.toBe(`navigatorNative.${key}`);
    }
    expect(leaves(pt.navigatorNative).length).toBeGreaterThan(130);
  });
  it("keeps the route a shared-metadata shell, with auth/account composition in the feature", () => {
    const route = readFileSync("src/routes/_authenticated/app.navigator.tsx", "utf8"),
      page = readFileSync("src/features/navigator/NavigatorPage.tsx", "utf8"),
      hook = readFileSync("src/features/navigator/hooks/use-navigator-profile.ts", "utf8");
    expect(route).toContain('modulePageHead("navigator")');
    expect(route).toContain("component: NavigatorPage");
    expect(route).not.toContain("useState");
    expect(route).not.toContain("useQuery");
    expect(page).toContain("key={user.id}");
    expect(hook).toContain("navigatorQueryKey(userId)");
    expect(hook).not.toContain("useWorkspace");
    expect(hook).not.toContain("localStorage");
    expect(hook).not.toContain("sessionStorage");
  });
});
