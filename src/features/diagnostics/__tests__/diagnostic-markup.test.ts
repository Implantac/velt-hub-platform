import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createI18nInstance } from "@/lib/i18n";
import { DiagnosticReadState } from "../components/DiagnosticReadState";
import { DiagnosticFeedback } from "../components/DiagnosticFeedback";
import { DiagnosticMethod } from "../components/DiagnosticMethod";
import { DiagnosticResults } from "../components/DiagnosticResults";
import { ScoreOverview } from "@/features/score/components/ScoreOverview";
import { ScoreGaps } from "@/features/score/components/ScoreGaps";
import { HealthCategoryCard } from "@/features/health/components/HealthCategoryCard";
import { healthRecords, id, scoreRecord } from "@/lib/diagnostics/__tests__/fixtures";
import {
  type DiagnosticData,
  HEALTH_CATEGORIES,
  SCORE_PILLARS,
  healthMethod,
  scoreMethod,
} from "@/lib/diagnostics/contracts";
import en from "@/lib/i18n/locales/en-US.json";
import pt from "@/lib/i18n/locales/pt-BR.json";

function render(language: "pt-BR" | "en-US", node: ReactNode) {
  return renderToStaticMarkup(
    createElement(I18nextProvider, { i18n: createI18nInstance(language) }, node),
  );
}
const feedback = {
  review: null,
  confirmed: false,
  onConfirm: vi.fn(),
  onRefresh: vi.fn(),
  onResume: vi.fn(),
  busy: false,
  canEdit: true,
};
const read = {
  hasData: false,
  isError: false,
  isFetching: true,
  busy: false,
  onRetry: vi.fn(),
  children: createElement("span", null, "CONFIRMED-CHILD"),
};

describe.each(["pt-BR", "en-US"] as const)("diagnostic markup in %s", (language) => {
  const t = createI18nInstance(language).t;
  it("does not render confirmed history or empty state during initial loading", () => {
    const html = render(language, createElement(DiagnosticReadState, read));
    expect(html).toContain(t("diagnostics.loading"));
    expect(html).toContain('role="status"');
    expect(html).not.toContain("CONFIRMED-CHILD");
    expect(html).not.toContain(t("diagnostics.score.emptyTitle"));
  });
  it("does not equate an initial failed read with empty history or zero", () => {
    const html = render(
      language,
      createElement(DiagnosticReadState, { ...read, isError: true, isFetching: false }),
    );
    expect(html).toContain(t("diagnostics.readError"));
    expect(html).toContain('role="alert"');
    expect(html).toContain(t("diagnostics.retry"));
    expect(html).not.toContain("CONFIRMED-CHILD");
  });
  it("keeps old data visible with a stale warning rather than a successful current reading", () => {
    const html = render(
      language,
      createElement(DiagnosticReadState, {
        ...read,
        hasData: true,
        isError: true,
        isFetching: false,
      }),
    );
    expect(html).toContain("CONFIRMED-CHILD");
    expect(html).toContain(t("diagnostics.stale"));
    expect(html).not.toContain(t("diagnostics.loading"));
  });
  it("labels a background reread without blanking cached history", () => {
    const html = render(language, createElement(DiagnosticReadState, { ...read, hasData: true }));
    expect(html).toContain("CONFIRMED-CHILD");
    expect(html).toContain(t("diagnostics.refreshing"));
    expect(html).toContain('aria-busy="true"');
  });
  it.each(["score", "health"] as const)(
    "only renders confirmed absence for %s successful read",
    (kind) => {
      const data: DiagnosticData = kind === "score" ? { kind, value: null } : { kind, value: [] };
      const html = render(language, createElement(DiagnosticResults, { data }));
      expect(html).toContain(t(`diagnostics.${kind}.emptyTitle`));
      expect(html).toContain(t(`diagnostics.${kind}.emptyHint`));
      expect(html).not.toContain("<button");
      expect(html).not.toContain('role="img"');
    },
  );
  it("renders six required pillars with actual zero rather than optional null fallbacks", () => {
    const row = { ...scoreRecord(), content: 0, breakdown: {} };
    const html = render(language, createElement(ScoreOverview, { score: row }));
    for (const key of SCORE_PILLARS) expect(html).toContain(t(`diagnostics.pillars.${key}`));
    expect(html).toContain(">0</span>");
    expect(html).toContain(t("diagnostics.legacyShort"));
    expect(html).not.toContain(t("diagnostics.pillarHints.growth"));
  });
  it("shows a v2 no-evidence queue pillar as unavailable with a formula warning, not measured failure", () => {
    const row = scoreRecord();
    const method = scoreMethod(row)!;
    row.growth = 0;
    method.diagnostic.jobEvidence = { successes: 0, failures: 0, excluded: 3 };
    row.breakdown = method;
    const html = render(language, createElement(ScoreOverview, { score: row }));
    expect(html).toContain("—");
    expect(html).toContain(t("diagnostics.noQueueEvidence"));
  });
  it("renders dates with explicit São Paulo context and versioned evidence", () => {
    const html = render(
      language,
      createElement(DiagnosticResults, { data: { kind: "score", value: scoreRecord() } }),
    );
    expect(html).toContain(t("diagnostics.timeZone"));
    expect(html).toContain("velt-records-v2");
    expect(html).toMatch(/datetime="2026-11-12T15:00:00\.123Z"/i);
    expect(html).toMatch(language === "pt-BR" ? /12:00/ : /12:00 PM/);
  });
  it("shows five saved health areas with headings, text groups and dates", () => {
    const html = render(
      language,
      createElement(DiagnosticResults, { data: { kind: "health", value: healthRecords() } }),
    );
    expect(html.match(/<article/g)).toHaveLength(5);
    expect(html.match(/<time /g)).toHaveLength(5);
    for (const category of HEALTH_CATEGORIES)
      expect(html).toContain(t(`diagnostics.categories.${category}`));
    expect(html).toContain(t("diagnostics.strengths"));
    expect(html).toContain(t("diagnostics.weaknesses"));
    expect(html).not.toContain(t("diagnostics.legacy"));
  });
  it("reports partial and mixed-age health without filling missing areas or averaging them", () => {
    const rows = healthRecords().slice(1);
    rows[0] = { ...rows[0], details: {}, computed_at: "2026-10-01T15:00:00Z" };
    const html = render(
      language,
      createElement(DiagnosticResults, { data: { kind: "health", value: rows } }),
    );
    expect(html.match(/<article/g)).toHaveLength(4);
    expect(html).toContain(
      t("diagnostics.partial", { categories: t("diagnostics.categories.marketing") }),
    );
    expect(html).toContain(t("diagnostics.mixed"));
    expect(html).toContain(t("diagnostics.legacy"));
  });
  it("preserves original legacy strings as escaped text with an explicit warning", () => {
    const rows = healthRecords()
      .slice(0, 1)
      .map((row) => ({
        ...row,
        details: {},
        strengths: ["Original <script>PT text</script>"],
        weaknesses: ["VeryLongSavedText".repeat(50)],
      }));
    const html = render(
      language,
      createElement(DiagnosticResults, { data: { kind: "health", value: rows } }),
    );
    expect(html).toContain("Original &lt;script&gt;PT text&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("overflow-wrap:anywhere");
    expect(html).toContain(t("diagnostics.legacy"));
  });
  it("keeps health zero when it is an actual saved value and avoids color-only meaning", () => {
    const row = { ...healthRecords()[0], score: 0, details: {} };
    const html = render(language, createElement(HealthCategoryCard, { h: row }));
    expect(html).toMatch(/>0<span/);
    expect(html).toContain(t("diagnostics.outOf100"));
    expect(html).toContain("aria-labelledby=");
    expect(html).toContain(t("diagnostics.weaknesses"));
  });
  it("labels both sample 500 and exact source count 1205 instead of calling the sample a total", () => {
    const meta = scoreMethod(scoreRecord())!.diagnostic;
    meta.sources.content = { loaded: 500, total: 1205, limit: 500 };
    const html = render(language, createElement(DiagnosticMethod, { meta }));
    expect(html).toContain(t("diagnostics.sampled"));
    expect(html).toContain(
      t("diagnostics.coverage", {
        loaded: "500",
        total: new Intl.NumberFormat(language).format(1205),
      }),
    );
    expect(html).toContain("<details>");
    expect(html).toContain(t("diagnostics.formulaTitle"));
  });
  it("uses translated v2 messages, not the Portuguese compatibility strings in English UI", () => {
    const row = healthRecords()[0];
    const method = healthMethod(row)!;
    const html = render(language, createElement(HealthCategoryCard, { h: row }));
    for (const code of [...method.strengthCodes, ...method.weaknessCodes])
      expect(html).toContain(t(`diagnostics.messages.${code}`));
    if (language === "en-US") expect(html).not.toContain(row.weaknesses[0]);
  });
  it("escapes legacy gaps and does not present no gaps as a guarantee", () => {
    const html = render(
      language,
      createElement(ScoreGaps, { gaps: ["Saved <img src=x onerror=alert(1)>"] }),
    );
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
    const empty = render(language, createElement(ScoreGaps, { gaps: [], codes: [] }));
    expect(empty).toContain(t("diagnostics.score.noGaps"));
  });
  it("keeps confirmed primary success separate from two secondary warnings and a failed reread", () => {
    const html = render(
      language,
      createElement(DiagnosticFeedback, {
        ...feedback,
        feedback: { kind: "saved", snapshotMissing: true, answersStale: true, readFailed: true },
      }),
    );
    for (const key of ["feedback.saved", "snapshotMissing", "answersStale", "savedReadFailed"])
      expect(html).toContain(t(`diagnostics.${key}`));
    expect(html).not.toContain(t("diagnostics.feedback.unconfirmed"));
    expect(html).not.toContain("<input");
  });
  it("never offers a blind retry of an uncertain POST; review requires a confirmed read then checkbox", () => {
    const before = render(
      language,
      createElement(DiagnosticFeedback, {
        ...feedback,
        feedback: { kind: "unconfirmed" },
        review: { refreshed: false },
      }),
    );
    expect(before).toContain(t("diagnostics.reviewRefresh"));
    expect(before).not.toContain("<input");
    expect(before).not.toContain(t("diagnostics.feedback.saved"));
    const after = render(
      language,
      createElement(DiagnosticFeedback, {
        ...feedback,
        feedback: { kind: "unconfirmed" },
        review: { refreshed: true },
      }),
    );
    expect(after).toContain('type="checkbox"');
    expect(after).toContain(t("diagnostics.reviewConfirm"));
    expect(after).toMatch(
      /<button[^>]+disabled[^>]*>[^<]*Finish|<button[^>]+disabled[^>]*>[^<]*Concluir/,
    );
  });
  it("does not offer write recovery controls to a viewer", () => {
    const html = render(
      language,
      createElement(DiagnosticFeedback, {
        ...feedback,
        canEdit: false,
        feedback: { kind: "unconfirmed" },
        review: { refreshed: true },
      }),
    );
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<button");
  });
});

describe("diagnostic composition and copy", () => {
  function leaves(value: unknown, prefix = ""): string[] {
    return value && typeof value === "object"
      ? Object.entries(value).flatMap(([key, child]) => leaves(child, prefix + key + "."))
      : [prefix.slice(0, -1)];
  }
  it("provides the same non-empty translation keys in both languages", () => {
    expect(leaves(pt.diagnostics).sort()).toEqual(leaves(en.diagnostics).sort());
    for (const language of ["pt-BR", "en-US"] as const) {
      const t = createI18nInstance(language).t;
      for (const key of leaves(pt.diagnostics)) {
        expect(t(`diagnostics.${key}`).trim()).not.toBe("");
        expect(t(`diagnostics.${key}`)).not.toBe(`diagnostics.${key}`);
      }
    }
  });
  it("keeps route shells thin, module metadata intact and all domain behavior in features", () => {
    for (const module of ["health", "score"]) {
      const source = readFileSync(`src/routes/_authenticated/app.${module}.tsx`, "utf8");
      expect(source.split("\n").length).toBeLessThan(25);
      expect(source).toContain(`modulePageHead("${module}")`);
      expect(source).not.toMatch(/useServerFn|useWorkspaceMutation|\.mutate\(/);
    }
  });
  it("keys workspace composition by module, identity and workspace, separate from access failure", () => {
    const source = readFileSync("src/features/diagnostics/DiagnosticPage.tsx", "utf8");
    expect(source).toContain("key={`${kind}:${access.userId}:${workspaceId}`}");
    expect(source).toContain("canReadDiagnostics(access.role)");
  });
});
