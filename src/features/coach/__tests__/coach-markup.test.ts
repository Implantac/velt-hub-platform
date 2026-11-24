import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createI18nInstance } from "@/lib/i18n";
import { COACH_RULES, coachMethod } from "@/lib/coach/contracts";
import {
  input,
  journey,
  later,
  legacy,
  page,
  recommendation,
  workspaceId,
} from "@/lib/coach/__tests__/fixtures";
import { CoachResults } from "../components/CoachResults";
import { RecommendationsList } from "../components/RecommendationsList";
import { JourneyTimeline } from "../components/JourneyTimeline";
import { CoachConfirmation } from "../components/CoachConfirmation";
import { CoachFeedback } from "../components/CoachFeedback";
import { CoachEvidence } from "../components/CoachEvidence";
import en from "@/lib/i18n/locales/en-US.json";
import pt from "@/lib/i18n/locales/pt-BR.json";
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) =>
    createElement("a", { ...props, href: to }, children),
}));
function render(language: "pt-BR" | "en-US", node: ReactNode) {
  return renderToStaticMarkup(
    createElement(I18nextProvider, { i18n: createI18nInstance(language) }, node),
  );
}
const results = {
  panel: "recommendations" as const,
  data: undefined,
  requestedPage: 1,
  isError: false,
  isFetching: true,
  busy: false,
  onRetry: vi.fn(),
  onPage: vi.fn(),
  children: createElement("p", null, "VERIFIED-CONTENT"),
};
const feedback = {
  operation: { pending: null, feedback: null, review: null },
  canEdit: true,
  confirmed: false,
  onConfirm: vi.fn(),
  onRefresh: vi.fn(),
  onResume: vi.fn(),
  busy: false,
  readReady: true,
};

describe.each(["pt-BR", "en-US"] as const)("Coach markup in %s", (language) => {
  const t = createI18nInstance(language).t;
  it("does not display an empty result or old content during initial loading", () => {
    const html = render(language, createElement(CoachResults, results));
    expect(html).toContain(t("coachNative.recommendations.loading"));
    expect(html).not.toContain(t("coachNative.recommendations.emptyTitle"));
    expect(html).not.toContain("VERIFIED-CONTENT");
  });
  it("does not turn a failed initial GET into no recommendations or raw technical details", () => {
    const html = render(
      language,
      createElement(CoachResults, { ...results, isError: true, isFetching: false }),
    );
    expect(html).toContain(t("coachNative.recommendations.readError"));
    expect(html).toContain('role="alert"');
    expect(html).not.toContain(t("coachNative.recommendations.emptyTitle"));
  });
  it("preserves cached rows under a stale warning and labels background rereads", () => {
    const html = render(
      language,
      createElement(CoachResults, { ...results, data: page(), isError: true }),
    );
    expect(html).toContain("VERIFIED-CONTENT");
    expect(html).toContain(t("coachNative.recommendations.stale"));
    expect(html).toContain(t("coachNative.reading"));
    expect(html).toContain('aria-busy="true"');
  });
  it("only renders absence after an exact successful read and labels count/filter/page", () => {
    const html = render(
      language,
      createElement(CoachResults, {
        ...results,
        data: { ...page(), items: [], total: 0 },
        isFetching: false,
      }),
    );
    expect(html).toContain(t("coachNative.recommendations.emptyTitle"));
    expect(html).toContain(t("coachNative.range", { start: "0", end: "0", total: "0" }));
    expect(html).not.toContain("VERIFIED-CONTENT");
  });
  it("offers an explicit first-page recovery for vanished history instead of silently changing pages", () => {
    const html = render(
      language,
      createElement(CoachResults, {
        ...results,
        data: { ...page(), page: 2, items: [], total: 3 },
        requestedPage: 2,
        isFetching: false,
      }),
    );
    expect(html).toContain(t("coachNative.pageOutOfRange"));
    expect(html).toContain(t("coachNative.firstPage"));
    expect(html).not.toContain(t("coachNative.recommendations.emptyTitle"));
  });
  it("gives journey failure its own vocabulary and does not imply the recommendation read failed", () => {
    const html = render(
      language,
      createElement(CoachResults, {
        ...results,
        panel: "journey",
        isError: true,
        isFetching: false,
      }),
    );
    expect(html).toContain(t("coachNative.journey.readError"));
    expect(html).not.toContain(t("coachNative.recommendations.readError"));
  });
  it("translates native codes and criteria, displays real dates in São Paulo, and names manual controls", () => {
    const row = recommendation(),
      method = coachMethod(row)!;
    const html = render(
      language,
      createElement(RecommendationsList, {
        recs: [row],
        canEdit: true,
        canWrite: true,
        onPrepare: vi.fn(),
      }),
    );
    expect(html).toContain(t(`coachNative.rules.${method.coach.code}.title`));
    expect(html).toContain(t(`coachNative.criteria.${method.coach.code}`));
    expect(html).toContain(t("coachNative.complete"));
    expect(html).toContain("aria-label=");
    expect(html).toContain("<time ");
    expect(html).toMatch(/12:00/);
    expect(html).toContain("velt-coach-v2");
    expect(html).toContain("velt-records-v2");
    expect(html).toContain("min-h-11");
    if (language === "en-US") expect(html).not.toContain(row.title);
  });
  it("preserves escaped original legacy text and drops unsafe stored navigation", () => {
    const row = legacy(0, { cta: { href: "javascript:alert(1)", label: "Unsafe destination" } });
    const html = render(
      language,
      createElement(RecommendationsList, {
        recs: [row],
        canEdit: false,
        canWrite: false,
        onPrepare: vi.fn(),
      }),
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<button");
    expect(html).toContain(t("coachNative.legacy"));
    expect(html).toContain("overflow-wrap:anywhere");
  });
  it("keeps both closed timestamps and conflicts visible, without actionable status controls", () => {
    const row = legacy(0, { completed_at: later, dismissed_at: later });
    const html = render(
      language,
      createElement(RecommendationsList, {
        recs: [row],
        canEdit: true,
        canWrite: true,
        onPrepare: vi.fn(),
      }),
    );
    expect(html).toContain(t("coachNative.conflictedHint"));
    expect(html).toContain(t("coachNative.completed"));
    expect(html).toContain(t("coachNative.dismissed"));
    expect(html).not.toContain("<button");
  });
  it("disables status controls when reads are stale or a mutation/review is pending", () => {
    const html = render(
      language,
      createElement(RecommendationsList, {
        recs: [recommendation()],
        canEdit: true,
        canWrite: false,
        onPrepare: vi.fn(),
      }),
    );
    expect(html.match(/<button[^>]*disabled/g)).toHaveLength(2);
  });
  it("labels a sampled 500 of 1205 base explicitly, with a separate 500 cap and historical batch ID", () => {
    const row = recommendation(),
      method = coachMethod(row)!;
    method.coach.evidence.sources.content = { loaded: 500, total: 1205, limit: 500 };
    row.cta = method;
    const html = render(language, createElement(CoachEvidence, { row }));
    expect(html).toContain(t("coachNative.sampled"));
    expect(html).toContain(
      t("coachNative.coverage", {
        loaded: "500",
        total: new Intl.NumberFormat(language).format(1205),
        limit: "500",
      }),
    );
    expect(html).toContain(input.batchId);
    expect(html).toContain("<details");
    expect(html).toContain(t("coachNative.evidenceHint"));
  });
  it("shows original journey text and sentiment in words without presenting it as AI context", () => {
    const html = render(
      language,
      createElement(JourneyTimeline, { events: [journey(0, { sentiment: "negative" })] }),
    );
    expect(html).toContain("&lt;img src=x&gt;");
    expect(html).not.toContain("<img");
    expect(html).toContain(t("coachNative.journeyOriginal"));
    expect(html).toContain(
      t("coachNative.sentiment", { value: t("coachNative.sentiments.negative") }),
    );
  });
  it("translates only a matched Coach secondary event and retains the native batch reference", () => {
    const row = journey(0, {
      kind: "signal",
      subject: "Coach registrou um novo lote de recomendações",
      payload: { source: "velt-coach-v2", batchId: input.batchId, count: 4 },
    });
    const html = render(language, createElement(JourneyTimeline, { events: [row] }));
    expect(html).toContain(t("coachNative.nativeEvent", { count: 4 }));
    expect(html).toContain(input.batchId);
    expect(html).not.toContain(t("coachNative.journeyOriginal"));
  });
  it.each(["generate", "status"] as const)(
    "requires an unchecked human acknowledgement before a %s confirmation",
    (kind) => {
      const proposal =
        kind === "generate"
          ? { kind }
          : { kind, row: recommendation(), action: "complete" as const };
      const html = render(
        language,
        createElement(CoachConfirmation, {
          proposal,
          acknowledged: false,
          onAcknowledge: vi.fn(),
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
          disabled: false,
        }),
      );
      expect(html).toContain('type="checkbox"');
      expect(html).toContain(t("coachNative.confirmAcknowledge"));
      expect(html).toMatch(/<button[^>]*disabled/);
      expect(html).toContain(
        t(
          kind === "generate" ? "coachNative.generateConfirmHint" : "coachNative.statusConfirmHint",
        ),
      );
    },
  );
  it("keeps confirmed primary success, event warning and read failure separate from an uncertain write", () => {
    const html = render(
      language,
      createElement(CoachFeedback, {
        ...feedback,
        operation: {
          pending: null,
          review: null,
          feedback: {
            kind: "generated",
            generated: 4,
            eventMissing: true,
            readFailed: true,
            journeyReadFailed: true,
            reference: input.batchId,
          },
        },
      }),
    );
    for (const key of ["eventMissing", "savedReadFailed", "savedJourneyReadFailed"])
      expect(html).toContain(t(`coachNative.${key}`));
    expect(html).toContain(t("coachNative.feedback.generated", { count: 4 }));
    expect(html).not.toContain(t("coachNative.feedback.unconfirmed"));
    expect(html).not.toContain('type="checkbox"');
  });
  it("never offers a blind POST retry; review requires a confirmed GET and separate acknowledgement", () => {
    const operation = {
      pending: null,
      feedback: { kind: "unconfirmed" as const },
      review: { refreshed: false },
    };
    const before = render(language, createElement(CoachFeedback, { ...feedback, operation }));
    expect(before).toContain(t("coachNative.reviewRefresh"));
    expect(before).not.toContain('type="checkbox"');
    const after = render(
      language,
      createElement(CoachFeedback, {
        ...feedback,
        operation: { ...operation, review: { refreshed: true } },
      }),
    );
    expect(after).toContain('type="checkbox"');
    expect(after).toMatch(/<button[^>]*disabled/);
    expect(after).toContain(t("coachNative.reviewResume"));
    const viewer = render(
      language,
      createElement(CoachFeedback, {
        ...feedback,
        canEdit: false,
        operation: { ...operation, review: { refreshed: true } },
      }),
    );
    expect(viewer).not.toContain('type="checkbox"');
    expect(viewer).not.toContain(t("coachNative.reviewResume"));
  });
});

function keys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) =>
    typeof child === "object" ? keys(child, prefix + key + ".") : [prefix + key],
  );
}
describe("Coach product integration", () => {
  it("has complete PT/EN key parity and stable Portuguese compatibility strings for all nine rules", () => {
    expect(keys(en.coachNative).sort()).toEqual(keys(pt.coachNative).sort());
    for (const [code, rule] of Object.entries(COACH_RULES)) {
      const key = code as keyof typeof pt.coachNative.rules;
      expect(pt.coachNative.rules[key].title).toBe(rule.title);
      expect(pt.coachNative.rules[key].body).toBe(rule.body);
      expect(en.coachNative.rules[key].title.length).toBeGreaterThan(3);
    }
  });
  it("keeps route composition/metadatas and uses identity-keyed membership-gated feature UI, not legacy hidden mutations", () => {
    const route = readFileSync("src/routes/_authenticated/app.coach.tsx", "utf8"),
      ui = readFileSync("src/features/coach/CoachPage.tsx", "utf8"),
      hook = readFileSync("src/features/coach/hooks/use-coach-workspace.ts", "utf8");
    expect(route).toContain('modulePageHead("coach")');
    expect(ui).toContain("key={`${access.userId}:${workspaceId}`}");
    expect(ui).toContain("useWorkspaceAccess");
    expect(ui).toContain("canReadCoach(access.role)");
    for (const name of [
      "useBrainRealtime",
      "BrainCoreService",
      "brainSnapshot",
      "brainRecommend",
      "runAIInsights",
    ])
      expect(route + ui + hook).not.toContain(name);
    expect(hook).toContain("confirmCoachPage");
    expect(hook).toContain("confirmJourneyPage");
    expect(hook).toContain("confirmCoachGeneration");
    expect(hook).toContain('refetchType: "none"');
  });
});
