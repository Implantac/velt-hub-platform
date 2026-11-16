import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { createI18nInstance } from "@/lib/i18n";
import { NotificationDrawer } from "../app/NotificationDrawer";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.query }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/api/notifications.functions", () => ({ listRecentEvents: vi.fn() }));

// A visible numeric badge is part of the trigger label, not an unread-state claim.
describe.each(["pt-BR", "en-US"] as const)("recent activity trigger in %s", (language) => {
  it.each([0, 1, 9, 10, 30])(
    "keeps the visible badge in the accessible name for %i events",
    (count) => {
      mocks.query.mockReturnValue({
        data: Array.from({ length: count }, (_, i) => ({
          id: String(i),
          event_type: "qa.interface_test",
          payload: null,
          created_at: "2026-01-01T12:00:00Z",
        })),
      });
      const html = renderToStaticMarkup(
        createElement(
          I18nextProvider,
          { i18n: createI18nInstance(language) },
          createElement(NotificationDrawer, { workspaceId: "qa-only" }),
        ),
      );
      const accessibleName = html.match(/aria-label="([^"]+)"/)?.[1];
      expect(accessibleName).toContain(language === "pt-BR" ? "Notificações" : "Notifications");
      if (count) {
        expect(accessibleName).toContain(count > 9 ? "9+" : String(count));
        expect(accessibleName).toContain(language === "pt-BR" ? "recente" : "recent");
      }
      expect(accessibleName).not.toMatch(/unread|não lid/i);
      expect(accessibleName).not.toContain("notifications.");
    },
  );
});
