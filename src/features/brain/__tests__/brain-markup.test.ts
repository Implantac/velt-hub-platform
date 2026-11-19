import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createI18nInstance } from "@/lib/i18n";
import {
  BRAIN_MEMORY_KINDS,
  type NativeMemories,
  type NativeRecommendations,
} from "@/lib/brain/native";
import { MemoryPanel } from "../components/MemoryPanel";
import { RecommendationsPanel } from "../components/RecommendationsPanel";
import { ReadFeedback } from "../components/ReadFeedback";
import en from "@/lib/i18n/locales/en-US.json";
import pt from "@/lib/i18n/locales/pt-BR.json";
const at = "2026-11-12T15:00:00Z";
const id = "10000000-0000-4000-8000-000000000001";
const recs: NativeRecommendations = {
  items: [
    {
      id,
      kind: "test",
      title: "Original <script>content</script>",
      rationale: "Original saved rationale",
      score: 0,
      status: "open",
      expires_at: null,
      created_at: at,
    },
  ],
  total: 1,
  limit: 50,
  checkedAt: at,
};
const memories: NativeMemories = {
  items: [{ id, content: "Original saved memory", kind: "outcome", created_at: at }],
  total: 1,
  limit: 50,
  checkedAt: at,
};
const memProps = {
  data: memories,
  isError: false,
  isFetching: false,
  canEdit: true,
  canWrite: true,
  memText: "My goal",
  setMemText: vi.fn(),
  memKind: "goal" as const,
  setMemKind: vi.fn(),
  onSubmit: vi.fn(),
  isPending: false,
  isSaving: false,
  onRetry: vi.fn(),
};
const recProps = {
  data: recs,
  isError: false,
  isFetching: false,
  canEdit: true,
  canWrite: true,
  onRetry: vi.fn(),
  onSetStatus: vi.fn(),
};
function render(language: "pt-BR" | "en-US", node: ReactNode) {
  return renderToStaticMarkup(
    createElement(I18nextProvider, { i18n: createI18nInstance(language) }, node),
  );
}

describe.each(["pt-BR", "en-US"] as const)("native Brain markup in %s", (language) => {
  const t = createI18nInstance(language).t;
  it.each(["loading", "error"] as const)(
    "does not render an unconfirmed empty child during %s",
    (state) => {
      const html = render(
        language,
        createElement(ReadFeedback, {
          state,
          label: "panel",
          isFetching: false,
          onRetry: vi.fn(),
          children: "FAKE_EMPTY_RESULT",
        }),
      );
      expect(html).not.toContain("FAKE_EMPTY_RESULT");
      expect(html).toContain(state === "error" ? 'role="alert"' : 'role="status"');
    },
  );
  it("retains prior data and exposes a named retry on stale read", () => {
    const html = render(
      language,
      createElement(RecommendationsPanel, { ...recProps, isError: true, canWrite: false }),
    );
    expect(html).toContain("Original saved rationale");
    expect(html).toContain(t("brainNative.stale", { panel: t("brainNative.recommendations") }));
    expect(html).toContain(
      t("brainNative.retryPanel", { panel: t("brainNative.recommendations") }),
    );
  });
  it("does not render empty success copy or count when the first read failed", () => {
    const html = render(
      language,
      createElement(RecommendationsPanel, { ...recProps, data: undefined, isError: true }),
    );
    expect(html).not.toContain(t("brainNative.noRecommendations"));
    expect(html).not.toContain("Showing 0");
  });
  it("labels status as a manual record, escapes saved text and keeps valid zero priority", () => {
    const html = render(language, createElement(RecommendationsPanel, recProps));
    expect(html).toContain(t("brainNative.markApplied"));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("0%");
    expect(html).toContain(t("brainNative.priority", { value: "0%" }));
    expect(html).not.toContain("NaN");
  });
  it("does not offer a viewer any status mutation", () => {
    const html = render(
      language,
      createElement(RecommendationsPanel, { ...recProps, canEdit: false }),
    );
    expect(html).not.toContain(t("brainNative.markApplied"));
    expect(html).not.toContain(t("brainNative.dismissNamed", { title: recs.items[0].title }));
    expect(html).toContain("Original saved rationale");
  });
  it("does not offer mutation on an expired open record", () => {
    const html = render(
      language,
      createElement(RecommendationsPanel, {
        ...recProps,
        data: { ...recs, items: [{ ...recs.items[0], expires_at: at }] },
      }),
    );
    expect(html).toContain(t("brainNative.status.expired"));
    expect(html).not.toContain(t("brainNative.markApplied"));
  });
  it("provides a labelled textarea and native radio group for all memory kinds", () => {
    const html = render(language, createElement(MemoryPanel, memProps));
    expect(html).toContain(
      '<legend class="mb-2 text-sm font-medium">' + t("brainNative.memoryKind") + "</legend>",
    );
    expect(html).toContain("<textarea");
    expect(html).toContain('maxLength="4000"');
    expect(html).toContain("aria-describedby=");
    for (const kind of BRAIN_MEMORY_KINDS) expect(html).toContain(t(`brainNative.kind.${kind}`));
    expect(html.match(/type="radio"/g) ?? []).toHaveLength(6);
  });
  it.each([" ", "x", "x".repeat(4001)])(
    "does not allow an invalid trimmed memory: %#",
    (memText) => {
      const html = render(language, createElement(MemoryPanel, { ...memProps, memText }));
      expect(html).toContain('aria-invalid="true"');
      expect(html).toMatch(/type="submit" disabled/);
    },
  );
  it("hides memory editing from a viewer but still renders confirmed records", () => {
    const html = render(language, createElement(MemoryPanel, { ...memProps, canEdit: false }));
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<textarea");
    expect(html).toContain("Original saved memory");
  });
  it("does not call an unrelated refresh a memory save in progress", () => {
    const html = render(
      language,
      createElement(MemoryPanel, { ...memProps, isPending: true, isSaving: false }),
    );
    expect(html).not.toContain(t("brainNative.saving"));
    expect(html).toContain(t("brainNative.saveMemory"));
  });
  it("labels real most-recent preview count separately from the total", () => {
    const data: NativeRecommendations = {
      ...recs,
      total: 1205,
      items: Array.from({ length: 50 }, (_, i) => ({ ...recs.items[0], id: `${id}-${i}` })),
    };
    const html = render(language, createElement(RecommendationsPanel, { ...recProps, data }));
    expect(html).toContain(
      t("brainNative.preview", {
        shown: "50",
        total: new Intl.NumberFormat(language).format(1205),
        limit: 50,
      }),
    );
  });
});
it("keeps the route as metadata/composition and the view free of legacy mutation wrappers", () => {
  const route = readFileSync(
    new URL("../../../routes/_authenticated/app.brain.tsx", import.meta.url),
    "utf8",
  );
  expect(route).toContain('modulePageHead("brain")');
  expect(route.split("\n").length).toBeLessThanOrEqual(10);
  const view = readFileSync(new URL("../BrainPage.tsx", import.meta.url), "utf8");
  const hooks = readFileSync(new URL("../hooks/use-brain-workspace.ts", import.meta.url), "utf8");
  expect(view).toContain("key={`${access.userId}:${workspaceId}`}");
  expect(hooks).not.toContain("toast.");
  expect(hooks).not.toContain("useWorkspaceMutation");
  expect(view).not.toMatch(/brainSnapshot|brainAskAll|runAIInsights/);
});
it("keeps the new PT/EN translation trees aligned", () => {
  function keys(value: unknown, prefix = ""): string[] {
    if (!value || typeof value !== "object") return [prefix];
    return Object.entries(value)
      .flatMap(([key, nested]) => keys(nested, prefix ? `${prefix}.${key}` : key))
      .sort();
  }
  expect(keys(pt.brainNative)).toEqual(keys(en.brainNative));
});
