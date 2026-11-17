import { describe, expect, it } from "vitest";
import {
  contentBrowseInputSchema,
  contentOrFilter,
  contentPageSchema,
  contentPrecedes,
  contentSearchPattern,
  cursorForContent,
  parseContentPage,
  normalizeContentSearchInput,
} from "../browse";
const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const workspaceId = uuid(1);
const item = (n = 10, created_at = "2026-11-12T12:00:00.123456+00:00") => ({
  id: uuid(n),
  workspace_id: workspaceId,
  title: "unit only",
  body: "text",
  type: "post" as const,
  status: "draft" as const,
  created_at,
  updated_at: created_at,
  media: [],
  metadata: {},
  brand: null,
  deliveryLocked: false,
});
const input = () => contentBrowseInputSchema.parse({ workspaceId });
const page = () => ({
  ...input(),
  requestCursor: null,
  items: [item()],
  counts: { all: 80, draft: 79, archived: 1, scheduled: 0, publishing: 0, published: 0, failed: 0 },
  workspaceTotal: 80,
  nextCursor: null,
});
describe("full-library content read contract", () => {
  it("keeps PostgREST's star alias literal instead of widening the search to everything", () => {
    expect(contentSearchPattern("*")).toBe("\\*");
  });
  it("normalizes a single-line search without turning its symbols into operators", () => {
    expect(normalizeContentSearchInput("a\nb\u0000c\td%_*\u007f")).toBe("abcd%_*");
    expect(normalizeContentSearchInput("x".repeat(201))).toHaveLength(200);
  });
  it.each(["[x]", "a|b", "(a+)+$", "^admin", "\\", ".*", "{1,2}", "a?", "a.b"])(
    "escapes every regex operator in %s",
    (search) => {
      const literal = new RegExp(contentSearchPattern(search), "i");
      expect(literal.test("prefix " + search + " suffix")).toBe(true);
      expect(literal.test("unrelated plain content")).toBe(false);
    },
  );
  it("uses bounded 20-item pages without silently treating 50 as the entire library", () => {
    expect(input().limit).toBe(20);
    expect(page().counts.all).toBeGreaterThan(page().items.length);
    expect(parseContentPage(page(), input()).workspaceTotal).toBe(80);
  });
  it("normalizes UUID case and search edges without changing the stored timestamp precision", () => {
    const d = contentBrowseInputSchema.parse({
      workspaceId: "ABCDEF00-0000-4000-8000-000000000001",
      search: "  Olá  ",
      cursor: { createdAt: item().created_at, id: uuid(10).toUpperCase() },
    });
    expect(d.workspaceId).toBe("abcdef00-0000-4000-8000-000000000001");
    expect(d.search).toBe("Olá");
    expect(d.cursor?.createdAt).toBe(item().created_at);
  });
  it.each([
    { limit: 0 },
    { limit: 51 },
    { limit: 1.5 },
    { search: "x".repeat(201) },
    { search: "two\nlines" },
    { search: "bad\u0000text" },
    { status: "unknown" },
    { workspaceId: "no" },
    { cursor: { createdAt: "no", id: uuid(2) } },
    { cursor: { createdAt: "2026-11-12T12:00:00.1234567Z", id: uuid(2) } },
    { cursor: { createdAt: item().created_at, id: "no" } },
  ])("rejects unsafe/invalid read input: %o", (patch) => {
    expect(contentBrowseInputSchema.safeParse({ ...input(), ...patch }).success).toBe(false);
  });
  it.each([1, 20, 50])("accepts an explicit bounded page size %s", (limit) =>
    expect(contentBrowseInputSchema.parse({ workspaceId, limit }).limit).toBe(limit),
  );
  it("escapes regex operators/backslashes while quotes, LIKE wildcards and commas stay literal", () => {
    const s = '50%_\\ "(a,b)"';
    expect(contentSearchPattern(s)).toBe('50%_\\\\ "\\(a,b\\)"');
    expect(contentOrFilter(s, null)).toBe(
      "title.imatch." +
        JSON.stringify(contentSearchPattern(s)) +
        ",body.imatch." +
        JSON.stringify(contentSearchPattern(s)) +
        ",matching_brand.not.is.null",
    );
  });
  it("does not replace the text OR when adding the stable cursor OR", () => {
    const c = cursorForContent(item());
    const text = contentOrFilter("literal", null),
      older = contentOrFilter("", c);
    expect(contentOrFilter("literal", c)).toBe(`and(or(${text}),or(${older}))`);
    expect(contentOrFilter("", null)).toBeNull();
  });
  it("preserves microseconds instead of rounding an entire tie to JavaScript milliseconds", () => {
    const a = cursorForContent(item(11, "2026-11-12T12:00:00.123455Z")),
      b = cursorForContent(item(10));
    expect(contentPrecedes(a, b)).toBe(true);
    expect(contentPrecedes(b, a)).toBe(false);
  });
  it("breaks identical timestamps deterministically with the UUID, including equivalent UTC offsets", () => {
    const a = { createdAt: "2026-11-12T09:00:00.123456-03:00", id: uuid(9) },
      b = cursorForContent(item(10));
    expect(contentPrecedes(a, b)).toBe(true);
    expect(contentPrecedes(b, a)).toBe(false);
    expect(contentPrecedes(b, b)).toBe(false);
  });
  it("uses exactly the last visible row for the next cursor", () => {
    const p = { ...page(), limit: 1, nextCursor: cursorForContent(item()) };
    expect(contentPageSchema.safeParse(p).success).toBe(true);
    expect(
      contentPageSchema.safeParse({ ...p, nextCursor: cursorForContent(item(9)) }).success,
    ).toBe(false);
  });
  it.each(["workspaceId", "status", "search", "limit", "requestCursor"])(
    "rejects a different result context: %s",
    (key) => {
      const replacements = {
        workspaceId: uuid(2),
        status: "archived",
        search: "other",
        limit: 5,
        requestCursor: cursorForContent(item(30)),
      };
      expect(() =>
        parseContentPage(
          { ...page(), [key]: replacements[key as keyof typeof replacements] },
          input(),
        ),
      ).toThrow();
    },
  );
  it.each([null, [], { error: "network unavailable" }, "success"])(
    "never interprets missing/error payload as empty content: %o",
    (raw) => expect(() => parseContentPage(raw, input())).toThrow(),
  );
  it("does not convert unavailable counts or missing lock checks to zero/availability", () => {
    expect(
      contentPageSchema.safeParse({ ...page(), counts: { ...page().counts, all: null } }).success,
    ).toBe(false);
    expect(
      contentPageSchema.safeParse({ ...page(), items: [{ ...item(), deliveryLocked: undefined }] })
        .success,
    ).toBe(false);
  });
  it("rejects repeated, unordered, foreign-workspace and falsely editable delivery rows", () => {
    for (const items of [
      [item(), item()],
      [item(9), item(10)],
      [{ ...item(), workspace_id: uuid(2) }],
      [{ ...item(), status: "scheduled", deliveryLocked: false }],
      [{ ...item(), status: "publishing", deliveryLocked: false }],
    ])
      expect(contentPageSchema.safeParse({ ...page(), items }).success).toBe(false);
  });
  it("accepts an empty matching page without pretending the workspace is empty", () => {
    const p = contentPageSchema.parse({
      ...page(),
      items: [],
      counts: { ...page().counts, all: 0, draft: 0, archived: 0 },
      workspaceTotal: 80,
    });
    expect(p.items).toEqual([]);
    expect(p.workspaceTotal).toBe(80);
  });
  it("does not promise an immutable snapshot across independently concurrent counts", () => {
    expect(
      contentPageSchema.safeParse({ ...page(), counts: { ...page().counts, all: 81 } }).success,
    ).toBe(true);
  });
});
