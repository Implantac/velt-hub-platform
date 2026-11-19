import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createI18nInstance } from "@/lib/i18n";
import { PanelFeedback } from "../components/PanelFeedback";
import { DashboardHeader } from "../components/DashboardHeader";
import { GettingStartedSection } from "../sections/GettingStartedSection";
import { KpiFooterSection } from "../sections/KpiFooterSection";
import { UpcomingJobsSection } from "../sections/UpcomingJobsSection";
import { FiveQuestionsSection } from "../sections/FiveQuestionsSection";
import { TopRowSection } from "../sections/TopRowSection";
import { CoachMissionsSection } from "../sections/CoachMissionsSection";
import { ActivityPipelineSection } from "../sections/ActivityPipelineSection";
import { OsLayersSection } from "../sections/OsLayersSection";
import type {
  DashboardAnalysis,
  DashboardBlueprint,
  DashboardOpportunity,
  DashboardSkills,
  DashboardHealth,
  DashboardOverview,
  DashboardRecommendation,
  PanelQuery,
} from "../types";
import type { SavedDashboardAnswer } from "@/lib/dashboard/saved-analysis";
import pt from "@/lib/i18n/locales/pt-BR.json";
import en from "@/lib/i18n/locales/en-US.json";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode; className?: string }) =>
    createElement("a", { href: to, ...rest }, children),
}));
function render(language: "pt-BR" | "en-US", node: ReactNode) {
  return renderToStaticMarkup(
    createElement(I18nextProvider, { i18n: createI18nInstance(language) }, node),
  );
}
function panel<T>(data: T | undefined, isError = false): PanelQuery<T> {
  return { data, isError, refetch: vi.fn() };
}
const at = "2026-11-12T15:00:00Z";
const emptyAnalysis: DashboardAnalysis = { score: null, answers: [] };
const health: DashboardHealth = [
  {
    id: "health",
    workspace_id: "ws",
    category: "marketing",
    score: 42,
    computed_at: at,
    details: {},
    strengths: [],
    weaknesses: [],
  },
];
const savedAnswer: SavedDashboardAnswer = {
  question: "next_action",
  headline: "Original saved text",
  body: "<script>no-script-execution</script>",
  cta: { href: "/app/content", label: "Saved action" },
  confidence: 0,
  computedAt: at,
  expiresAt: at,
  expired: true,
};
const recommendation: DashboardRecommendation = {
  id: "recommendation",
  kind: "warning",
  title: "Original recommendation",
  body: null,
  severity: "high",
  cta: { href: "/app/content", label: "Saved recommendation action" },
};
const jobs: DashboardOverview["upcomingJobs"] = Array.from({ length: 5 }, (_, index) => ({
  id: `job-${index}`,
  status: "pending",
  scheduled_at: at,
}));

describe.each(["pt-BR", "en-US"] as const)("dashboard markup in %s", (language) => {
  const t = createI18nInstance(language).t;
  it("has separate, clearly named data refresh and Brain navigation", () => {
    const html = render(
      language,
      createElement(DashboardHeader, { onRefresh: vi.fn(), isPending: false }),
    );
    expect(html).toContain(t("dashboard.refreshData"));
    expect(html).toContain('href="/app/brain"');
    expect(html).toContain(t("dashboard.openBrain"));
    expect(html).not.toContain("Pensar de novo");
    expect(html).not.toContain("dashboard.refreshData");
  });
  it.each(["loading", "error"] as const)(
    "does not render an unconfirmed zero/empty child when %s",
    (state) => {
      const html = render(
        language,
        createElement(PanelFeedback, {
          state,
          label: "test panel",
          onRetry: vi.fn(),
          children: createElement("p", {}, "UNCONFIRMED-0"),
        }),
      );
      expect(html).not.toContain("UNCONFIRMED-0");
      expect(html).toContain(state === "error" ? 'role="alert"' : 'role="status"');
      if (state === "error")
        expect(html).toContain(t("dashboard.retryPanel", { panel: "test panel" }));
    },
  );
  it("keeps prior values with an explicit stale warning after refresh failure", () => {
    const html = render(
      language,
      createElement(PanelFeedback, {
        state: "stale",
        label: "test panel",
        onRetry: vi.fn(),
        children: createElement("p", {}, "CONFIRMED-1205"),
      }),
    );
    expect(html).toContain("CONFIRMED-1205");
    expect(html).toContain(t("dashboard.stalePanel", { panel: "test panel" }));
    expect(html).toContain('role="status"');
  });
  it("counts only two essential steps and labels social connection optional", () => {
    const html = render(
      language,
      createElement(GettingStartedSection, {
        counts: { brands: 1, content: 1, channelsConnected: 0 },
        canEdit: true,
        canManage: true,
      }),
    );
    expect(html).toContain('aria-valuemax="2"');
    expect(html).toContain('aria-valuenow="2"');
    expect(html).toContain(t("gettingStarted.progress", { done: 2, total: 2 }));
    expect(html).toContain(t("gettingStarted.optional"));
  });
  it("does not invite a viewer to create/edit or resume onboarding", () => {
    const html = render(
      language,
      createElement(GettingStartedSection, {
        counts: { brands: 0, content: 0, channelsConnected: 0 },
        canEdit: false,
        canManage: false,
        onResume: vi.fn(),
      }),
    );
    expect(html).toContain(t("gettingStarted.readOnlyTitle"));
    expect(html).not.toContain(t("gettingStarted.brandAction"));
    expect(html).not.toContain(t("gettingStarted.contentAction"));
    expect(html).not.toContain(t("gettingStarted.resume"));
    expect(html).toContain(t("access.manageOnly"));
    expect(html).toContain('href="/app/brands"');
  });
  it("shows the real scheduled total, not the five-item preview size", () => {
    const html = render(
      language,
      createElement(KpiFooterSection, {
        brands: 3,
        channelsConnected: 1203,
        channels: 2404,
        content: 3724,
        scheduled: 1205,
      }),
    );
    expect(html).toContain(new Intl.NumberFormat(language).format(1205));
    expect(html).toContain(t("dashboard.futurePending"));
    const list = render(language, createElement(UpcomingJobsSection, { jobs, total: 1205 }));
    expect(list).toContain(
      t("dashboard.upcomingPreview", {
        shown: "5",
        total: new Intl.NumberFormat(language).format(1205),
      }),
    );
    expect(list.match(/<time /g)).toHaveLength(5);
    expect(list).toContain("12:00");
  });
  it("uses a saved date, expiration and escaped original text rather than pretending to analyze", () => {
    const html = render(language, createElement(FiveQuestionsSection, { answers: [savedAnswer] }));
    expect(html).toContain("Original saved text");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain(t("dashboard.expiredAnswer"));
    expect(html).toContain(t("dashboard.questions.where_am_i"));
    expect(html).toContain(t("dashboard.noSavedAnswer"));
    expect(html).toContain('aria-valuenow="0"');
    expect(html).not.toContain("Analisando");
  });
  it("does not create an unsafe action link from stored/AI content", () => {
    const unsafe = {
      ...savedAnswer,
      cta: { href: "javascript:alert(1)", label: "Unsafe action label" },
    };
    const html = render(language, createElement(FiveQuestionsSection, { answers: [unsafe] }));
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("Unsafe action label");
  });
  it("does not draw a zero score or claim an empty health history before a failed read", () => {
    const html = render(
      language,
      createElement(TopRowSection, {
        analysis: panel<DashboardAnalysis>(undefined, true),
        health: panel<DashboardHealth>(undefined, true),
        opportunities: panel<DashboardOpportunity[]>(undefined, true),
      }),
    );
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain(t("dashboard.noSavedScore"));
    expect(html).not.toContain(t("dashboard.noSavedHealth"));
    expect(html.match(/role="alert"/g)).toHaveLength(3);
  });
  it("distinguishes a genuine saved zero from no saved score", () => {
    const html = render(
      language,
      createElement(TopRowSection, {
        analysis: panel({ ...emptyAnalysis, score: { overall: 0, computedAt: at } }),
        health: panel([]),
        opportunities: panel([]),
      }),
    );
    expect(html).toContain('role="img"');
    expect(html).toContain(t("scoreGauge.starting"));
    expect(html).not.toContain(t("dashboard.noSavedScore"));
    expect(html).toContain(t("dashboard.noSavedHealth"));
  });
  it("keeps cached health and labels the average coverage truthfully", () => {
    const html = render(
      language,
      createElement(TopRowSection, {
        analysis: panel(emptyAnalysis),
        health: panel(health, true),
        opportunities: panel([]),
      }),
    );
    expect(html).toContain("42");
    expect(html).toContain(t("dashboard.healthAverage", { count: 1 }));
    expect(html).toContain(t("dashboard.stalePanel", { panel: t("dashboard.businessHealth") }));
  });
  it("excludes dismissed/done missions and localizes the active status", () => {
    const missions: DashboardOverview["missions"] = [
      { id: "one", title: "ACTIVE-MISSION", status: "pending", priority: 2 },
      { id: "two", title: "DISMISSED-MISSION", status: "dismissed", priority: 3 },
      { id: "three", title: "DONE-MISSION", status: "done", priority: 3 },
    ];
    const html = render(
      language,
      createElement(CoachMissionsSection, {
        recommendations: panel([recommendation]),
        priorityMissions: missions,
      }),
    );
    expect(html).toContain("ACTIVE-MISSION");
    expect(html).not.toContain("DISMISSED-MISSION");
    expect(html).not.toContain("DONE-MISSION");
    expect(html).toContain(t("dashboard.missionStates.pending"));
    expect(html).toContain(t("dashboard.severity.high"));
    expect(html).not.toContain("Atualizar GPS");
  });
  it("keeps each OS-layer's unavailable state separate from confirmed zero totals", () => {
    const html = render(
      language,
      createElement(OsLayersSection, {
        blueprint: panel<DashboardBlueprint>({ exists: false, filled: 0, total: 10 }),
        competitors: panel({ total: 1303, high: 40 }),
        skills: panel<DashboardSkills>(undefined, true),
        journey: panel({ events: 0, decisions: 0, latestEventAt: null }),
      }),
    );
    expect(html).toContain(t("dashboard.layers.noBlueprint"));
    expect(html).toContain(new Intl.NumberFormat(language).format(1303));
    expect(html).toContain(
      t("dashboard.unavailablePanel", { panel: t("dashboard.layers.skills") }),
    );
    expect(html).not.toContain(t("dashboard.layers.noSkills"));
    expect(html.match(/role="alert"/g)).toHaveLength(1);
  });
  it("localizes content statuses and consistently formats activity dates", () => {
    const html = render(
      language,
      createElement(ActivityPipelineSection, {
        events: [{ id: "event", event_type: "content.created", created_at: at, payload: {} }],
        contentByStatus: { draft: 1201 },
      }),
    );
    expect(html).toContain(t("content.draft"));
    expect(html).toContain(new Intl.NumberFormat(language).format(1201));
    expect(html).toContain("12:00");
    expect(html).not.toContain("dashboard.recentActivity");
  });
});

describe("dashboard integration boundaries", () => {
  it("keeps the file route a composition shell with the shared metadata helper", () => {
    const source = readFileSync(
      new URL("../../../routes/_authenticated/app.index.tsx", import.meta.url),
      "utf8",
    );
    expect(source.split("\n").length).toBeLessThan(15);
    expect(source).toContain('modulePageHead("dashboard")');
    expect(source).toContain("component: DashboardPage");
  });
  it("does not call write/generation/AI functions from the dashboard feature", () => {
    const source = [
      "../DashboardPage.tsx",
      "../hooks/use-dashboard-advanced.ts",
      "../hooks/use-dashboard-read-refresh.ts",
    ]
      .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
      .join("\n");
    for (const forbidden of [
      "brainSnapshot",
      "brainRecommend",
      "brainAskAll",
      "useMutation",
      "runAIInsights",
    ])
      expect(source).not.toContain(forbidden);
  });
  it("has matching PT/EN keys for all dashboard/static score copy", () => {
    const flatten = (value: object, prefix = ""): string[] =>
      Object.entries(value).flatMap(([key, item]) =>
        typeof item === "object" && item !== null
          ? flatten(item, `${prefix}${key}.`)
          : [`${prefix}${key}`],
      );
    for (const key of ["dashboard", "gettingStarted", "scoreGauge"] as const)
      expect(flatten(pt[key]).sort(), key).toEqual(flatten(en[key]).sort());
  });
});
