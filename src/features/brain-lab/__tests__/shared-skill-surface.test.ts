import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18nInstance } from "@/lib/i18n";
import { workspacePermissions } from "@/lib/workspace/permissions";
import { useWorkspaceAccess } from "@/lib/workspace/use-workspace-access";
import { useCurrentWorkspaceId } from "@/lib/workspace/use-workspace";
import { useSkillMap } from "@/features/skill-map/hooks/use-skill-map";
import { SkillMapSurface } from "@/features/skill-map/SkillMapSurface";
import { SkillMapPage } from "@/features/skill-map/SkillMapPage";
import { skillEditor } from "@/features/skill-map/presentation";
import {
  assessment,
  uid,
  workspaceId,
  snapshot,
  operationId,
  receipt,
} from "@/lib/skill-map/__tests__/fixtures";
import { SkillsPanel } from "../panels/SkillsPanel";

vi.mock("@/lib/workspace/use-workspace-access", () => ({ useWorkspaceAccess: vi.fn() }));
vi.mock("@/lib/workspace/use-workspace", () => ({ useCurrentWorkspaceId: vi.fn() }));
vi.mock("@/features/skill-map/hooks/use-skill-map", () => ({ useSkillMap: vi.fn() }));
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
type Model = ReturnType<typeof useSkillMap>;
function model(): Model {
  return {
    query: { data: snapshot(), isError: false, isFetching: false } as Model["query"],
    view: { editor: null, receipt: null },
    editor: null,
    operation: { pending: false, reading: false, reference: null, feedback: null, review: null },
    busy: false,
    readReady: true,
    matches: false,
    parsed: null,
    needsSave: false,
    canChoose: true,
    canReview: false,
    canSave: false,
    acknowledged: false,
    reviewConfirmed: false,
    setAcknowledged: vi.fn(),
    setReviewConfirmed: vi.fn(),
    refresh: vi.fn(),
    choose: vi.fn(),
    changeDraft: vi.fn(),
    setStep: vi.fn(),
    cancel: vi.fn(),
    loadLatest: vi.fn(),
    save: vi.fn(),
    resume: vi.fn(),
  };
}
function access(role: string | null = "viewer") {
  return {
    ...workspacePermissions(role),
    userId: uid,
    authLoading: false,
    role,
    isPending: false,
    isError: false,
    isFetching: false,
    retry: vi.fn(),
  } as ReturnType<typeof useWorkspaceAccess>;
}
const render = (language: "pt-BR" | "en-US", node: ReactNode) =>
  renderToStaticMarkup(
    createElement(I18nextProvider, { i18n: createI18nInstance(language) }, node),
  );
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useWorkspaceAccess).mockReturnValue(access());
  vi.mocked(useCurrentWorkspaceId).mockReturnValue([workspaceId, vi.fn()]);
  vi.mocked(useSkillMap).mockReturnValue(model());
});

for (const language of ["pt-BR", "en-US"] as const)
  for (const placement of ["page", "panel"] as const) {
    const t = createI18nInstance(language).t;
    const surface = () => createElement(SkillMapSurface, { placement });
    describe(`Shared personal Skill Map ${language}/${placement}`, () => {
      it.each(["owner", "admin", "editor", "viewer"])(
        "%s uses the same expected-account/workspace hook and ten-area snapshot",
        (role) => {
          vi.mocked(useWorkspaceAccess).mockReturnValue(access(role));
          const html = render(language, surface());
          expect(useSkillMap).toHaveBeenCalledOnce();
          expect(useSkillMap).toHaveBeenCalledWith(uid, workspaceId);
          expect(html).toContain(`data-skill-surface="${placement}"`);
          for (const area of [
            "copy",
            "content",
            "product",
            "sales",
            "branding",
            "analytics",
            "automation",
            "prospecting",
            "community",
            "strategy",
          ]) {
            expect(html).toContain(
              `id="${placement === "panel" ? "brain-lab-skill" : "skill"}-${area}-title"`,
            );
            expect(html).toContain(
              t("skillMapNative.chooseArea", { area: t(`skillMapNative.areas.${area}.label`) }),
            );
          }
          expect(html).toContain(t("skillMapNative.scopeHint"));
          expect(html).toContain(assessment().notes);
          expect(html).not.toContain('type="range"');
          expect(html).not.toContain('type="submit"');
          expect(vi.mocked(useSkillMap).mock.results[0].value.save).not.toHaveBeenCalled();
        },
      );
      it.each([
        "auth-loading",
        "membership-loading",
        "no-account",
        "no-workspace",
        "membership-error",
        "unknown-role",
        "null-role",
      ])("%s cannot mount the data/operation hook", (state) => {
        const a = access();
        if (state === "auth-loading") a.authLoading = true;
        if (state === "membership-loading") a.isPending = true;
        if (state === "no-account") a.userId = null;
        if (state === "no-workspace")
          vi.mocked(useCurrentWorkspaceId).mockReturnValue([null, vi.fn()]);
        if (state === "membership-error") a.isError = true;
        if (state === "unknown-role") Object.assign(a, { role: "unknown" });
        if (state === "null-role") a.role = null;
        vi.mocked(useWorkspaceAccess).mockReturnValue(a);
        const html = render(language, surface());
        expect(useSkillMap).not.toHaveBeenCalled();
        expect(html).not.toContain("skill-copy-title");
        expect(html).not.toContain('type="submit"');
        if (["membership-error", "unknown-role", "null-role"].includes(state)) {
          expect(html).toContain(t("skillMapNative.accessUnavailable"));
          expect(html).toContain(placement === "panel" ? "<h2" : "<h1");
        }
      });
      it("uncertain draft/reference renders the same locked recovery without another transport", () => {
        const m = model(),
          draft = {
            ...skillEditor("copy", assessment()),
            score: "0",
            notes: " Kept original draft ",
            step: "review" as const,
          };
        m.editor = draft;
        m.view.editor = draft;
        m.canChoose = false;
        m.needsSave = true;
        m.matches = true;
        m.operation = {
          pending: false,
          reading: false,
          reference: operationId,
          feedback: { kind: "unconfirmed", reference: operationId, readFailed: true },
          review: { refreshed: false },
        };
        vi.mocked(useSkillMap).mockReturnValue(m);
        const html = render(language, surface());
        expect(html).toContain(t("skillMapNative.feedback.unconfirmed"));
        expect(html).toContain(operationId);
        expect(html).toContain(" Kept original draft ");
        expect(html).toContain(t("skillMapNative.recoveryConsent"));
        expect(html).toContain(t("skillMapNative.resume"));
        expect(html).toContain('disabled=""');
        expect(m.save).not.toHaveBeenCalled();
        expect(m.refresh).not.toHaveBeenCalled();
        expect(m.resume).not.toHaveBeenCalled();
      });
      it("a primary receipt stays visible independently of an unavailable read", () => {
        const m = model();
        m.query = { data: snapshot(), isError: true, isFetching: false } as Model["query"];
        m.view.receipt = receipt();
        m.readReady = false;
        m.canChoose = false;
        m.operation = {
          pending: false,
          reading: false,
          reference: operationId,
          feedback: { kind: "saved", reference: operationId, readFailed: true },
          review: null,
        };
        vi.mocked(useSkillMap).mockReturnValue(m);
        const html = render(language, surface());
        expect(html).toContain(t("skillMapNative.feedback.saved"));
        expect(html).toContain(t("skillMapNative.savedReadWarning"));
        expect(html).toContain(t("skillMapNative.stale"));
        expect(html).not.toContain(t("skillMapNative.feedback.unconfirmed"));
        expect(m.save).not.toHaveBeenCalled();
        expect(m.refresh).not.toHaveBeenCalled();
      });
    });
  }

describe("thin entry adapters", () => {
  it("native page and Brain Lab panel share the same scope signature and only change presentation", () => {
    const page = render("en-US", createElement(SkillMapPage));
    const panel = render("en-US", createElement(SkillsPanel));
    expect(useSkillMap).toHaveBeenNthCalledWith(1, uid, workspaceId);
    expect(useSkillMap).toHaveBeenNthCalledWith(2, uid, workspaceId);
    expect(page).toContain('data-skill-surface="page"');
    expect(page).toContain("<h1");
    expect(panel).toContain('data-skill-surface="panel"');
    expect(panel).not.toContain("<h1");
    expect(panel).toContain('<h3 id="brain-lab-skill-copy-title"');
  });
});
