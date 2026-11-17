import { describe, expect, it } from "vitest";
import { contentPageScope, currentPageSelection, canModifyContent } from "../browse-state";
import type { ContentBrowseItem } from "@/lib/content/browse";
const row = (id: string, patch: Partial<ContentBrowseItem> = {}): ContentBrowseItem => ({
  id,
  workspace_id: "ws",
  title: "unit",
  body: "",
  media: [],
  metadata: {},
  created_at: "2026-11-12T00:00:00Z",
  updated_at: "2026-11-12T00:00:00Z",
  brand: null,
  status: "draft",
  type: "post",
  deliveryLocked: false,
  ...patch,
});
const scope = contentPageScope("ws", "all", "", null),
  selection = { scope, ids: ["one", "hidden", "locked", "reserved", "one"] },
  items = [
    row("one"),
    row("two"),
    row("locked", { deliveryLocked: true }),
    row("reserved", { status: "scheduled" }),
  ];
describe("page-scoped content selection", () => {
  it("removes invisible, repeated, locked and lifecycle-controlled targets", () =>
    expect([...currentPageSelection(selection, scope, items, true)]).toEqual(["one"]));
  it.each([
    contentPageScope("other", "all", "", null),
    contentPageScope("ws", "draft", "", null),
    contentPageScope("ws", "all", "query", null),
    contentPageScope("ws", "all", "", { createdAt: "2026-11-12T00:00:00Z", id: "last" }),
  ])("never reuses selection in another workspace/filter/search/page: %s", (next) =>
    expect(currentPageSelection(selection, next, items, true).size).toBe(0),
  );
  it("never exposes selected mutation targets for a read-only member", () =>
    expect(currentPageSelection(selection, scope, items, false).size).toBe(0));
  it("reconciles disappearance and a newly active delivery on a real refresh", () => {
    expect(currentPageSelection(selection, scope, [], true).size).toBe(0);
    expect(
      currentPageSelection(selection, scope, [row("one", { deliveryLocked: true })], true).size,
    ).toBe(0);
  });
  it.each(["scheduled", "publishing"] as const)(
    "conservatively blocks %s even without a job flag",
    (status) => expect(canModifyContent(row("one", { status }))).toBe(false),
  );
  it.each(["draft", "failed", "archived", "published"] as const)(
    "keeps the database lock authoritative for %s",
    (status) => {
      expect(canModifyContent(row("one", { status }))).toBe(true);
      expect(canModifyContent(row("one", { status, deliveryLocked: true }))).toBe(false);
    },
  );
});
