import { describe, expect, it } from "vitest";
import {
  confirmLearningPage,
  confirmLearningProgress,
  confirmLearningProgressBatch,
  confirmLearningReceipt,
  learningBrowseSchema,
  learningCatalogVersion,
  learningChange,
  learningCounts,
  learningPathSchema,
  learningProgressEqual,
  learningProgressFor,
  learningProgressInputSchema,
  learningSameInstant,
  learningSetInputSchema,
} from "../contracts";
import {
  at,
  batch,
  earlier,
  input,
  learningPath,
  operationId,
  otherPath,
  otherUser,
  page,
  pid,
  progress,
  receipt,
  uid,
  workspaceId,
} from "./fixtures";

describe("Learning catalog boundaries", () => {
  it("keeps saved original text, empty optional fields and zero hour estimates", () => {
    const raw = learningPath({
      title: " Original <script>not-code</script> ",
      description: "",
      category: null,
    });
    expect(learningPathSchema.parse(raw)).toEqual(raw);
    expect(learningBrowseSchema.parse({})).toEqual({ page: 1 });
  });
  it.for([
    null,
    undefined,
    {},
    [],
    learningPath({ estimated_hours: -1 }),
    learningPath({ difficulty: "unknown" as never }),
    learningPath({ title: "  " }),
    learningPath({ milestones: [{ id: "x", title: " " }] }),
    learningPath({
      milestones: [
        { id: "x", title: "A" },
        { id: "x", title: "B" },
      ],
    }),
  ])("rejects malformed catalog instead of filtering milestones: %j", (value) => {
    expect(learningPathSchema.safeParse(value).success).toBe(false);
  });
  it.for([{ page: 0 }, { page: 1.5 }, { page: 100001 }, { page: 1, workspaceId }, undefined, null])(
    "requires a bounded explicit browse input: %j",
    (value) => expect(learningBrowseSchema.safeParse(value).success).toBe(false),
  );
  it("confirms exact empty catalog and a disappeared page independently", () => {
    expect(confirmLearningPage(page({ total: 0, items: [] }), { page: 1 }).total).toBe(0);
    expect(confirmLearningPage(page({ page: 3, total: 2, items: [] }), { page: 3 }).items).toEqual(
      [],
    );
  });
  it.for([
    null,
    undefined,
    [],
    page({ total: 0 }),
    page({ total: 2 }),
    page({ total: undefined as never }),
    page({ pageSize: 10 as never }),
    page({ items: null as never }),
    page({ checkedAt: "invalid" }),
    page({ total: 2, items: [learningPath(), learningPath()] }),
  ])("rejects unconfirmed counts, partial/truncated or duplicate pages: %j", (value) =>
    expect(() => confirmLearningPage(value, { page: 1 })).toThrow(),
  );
  it("rejects a page for a different requested number", () =>
    expect(() => confirmLearningPage(page(), { page: 2 })).toThrow());
  it.for([
    "title",
    "description",
    "category",
    "slug",
    "difficulty",
    "estimated_hours",
    "milestones",
    "recommended_for",
    "created_at",
    "id",
  ] as const)("observes changes to catalog field %s", (field) => {
    const p = learningPath();
    const changed = {
      ...p,
      [field]: field === "milestones" ? [{ id: "new", title: "New" }] : "different",
    };
    expect(learningCatalogVersion(changed as typeof p)).not.toBe(learningCatalogVersion(p));
  });
  it("does not use object property order as a catalog version", () => {
    const p = learningPath();
    expect(
      learningCatalogVersion({
        ...p,
        milestones: p.milestones.map(({ id, title }) => ({ title, id })),
      }),
    ).toBe(learningCatalogVersion(p));
  });
});
describe("Complete personal progress reads", () => {
  it("accepts only explicit null as absence, retaining legacy percentages, IDs and workspace metadata", () => {
    expect(confirmLearningProgress(null, uid, pid)).toBeNull();
    const p = progress({ completed_milestones: ["first", "", " old ", "<script>x</script>"] });
    expect(confirmLearningProgress(p, uid, pid)).toEqual(p);
  });
  it.for([
    undefined,
    {},
    [],
    progress({ user_id: otherUser }),
    progress({ path_id: otherPath }),
    progress({ completed_milestones: ["first", "first"] }),
    progress({ updated_at: "bad" }),
    progress({ progress_pct: 1.5 }),
  ])("rejects invalid/foreign progress without showing absence: %j", (value) =>
    expect(() => confirmLearningProgress(value, uid, pid)).toThrow(),
  );
  it.for([
    [],
    [pid, pid],
    Array.from({ length: 21 }, (_, i) => `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`),
    ["bad"],
  ])("requires 1–20 unique path IDs: %j", (pathIds) =>
    expect(learningProgressInputSchema.safeParse({ accountId: uid, pathIds }).success).toBe(false),
  );
  it("returns null for a missing row only inside a valid complete batch", () => {
    const b = confirmLearningProgressBatch(
      batch({ items: [], total: 0 }),
      { accountId: uid, pathIds: [pid] },
      uid,
    );
    expect(learningProgressFor(b, pid)).toBeNull();
    expect(() => learningProgressFor(b, otherPath)).toThrow();
  });
  it.for([
    undefined,
    null,
    batch({ userId: otherUser }),
    batch({ pathIds: [otherPath] }),
    batch({ total: 2 }),
    batch({ total: null as never }),
    batch({ items: [progress({ user_id: otherUser })] }),
    batch({ items: [progress({ path_id: otherPath })] }),
    batch({ items: [progress(), progress()], total: 2 }),
  ])("rejects a partial/foreign/duplicate batch before rendering: %j", (value) =>
    expect(() =>
      confirmLearningProgressBatch(value, { accountId: uid, pathIds: [pid] }, uid),
    ).toThrow(),
  );
  it("rejects duplicate record IDs across distinct paths", () => {
    expect(() =>
      confirmLearningProgressBatch(
        batch({
          pathIds: [pid, otherPath],
          total: 2,
          items: [progress(), progress({ path_id: otherPath })],
        }),
        { accountId: uid, pathIds: [pid, otherPath] },
        uid,
      ),
    ).toThrow();
  });
});
describe("Manual percentage, preservation and explicit state commands", () => {
  it("counts current IDs only, preserving all unknown original IDs", () => {
    expect(learningCounts(learningPath(), progress())).toEqual({
      known: 1,
      total: 2,
      percent: 50,
      unknown: ["legacy-original"],
    });
    const p = progress();
    const change = learningChange(input({ expectedProgress: p }), learningPath(), uid);
    expect(change.next).toEqual(["first", "legacy-original", "second"]);
    expect(change.counts.percent).toBe(100);
    expect(p.progress_pct).toBe(175);
    expect(p.completed_milestones).toEqual(["first", "legacy-original"]);
  });
  it("never invents completion for an empty path", () =>
    expect(learningCounts(learningPath({ milestones: [] }), null)).toEqual({
      known: 0,
      total: 0,
      percent: 0,
      unknown: [],
    }));
  it("unmarking affects only the selected current ID and recomputes the known ratio", () => {
    const p = progress({
      completed_milestones: ["legacy-original", "second", "first"],
      progress_pct: 250,
    });
    const change = learningChange(
      input({ completed: false, expectedProgress: p }),
      learningPath(),
      uid,
    );
    expect(change.next).toEqual(["legacy-original", "first"]);
    expect(change.counts.percent).toBe(50);
  });
  it.for([true, false])(
    "a desired state already observed (%s) is unchanged, not another toggle",
    (completed) => {
      const request = input({
        milestoneId: "first",
        completed,
        expectedProgress: completed ? progress() : null,
      });
      const change = learningChange(request, learningPath(), uid);
      expect(change.changed).toBe(false);
      expect(change.mode).toBe("unchanged");
    },
  );
  it("rounds by the current denominator instead of legacy count, capped sliders or stored pct", () => {
    const p = learningPath({ milestones: ["a", "b", "c"].map((id) => ({ id, title: id })) });
    expect(learningCounts(p, { completed_milestones: ["a", "old", "unrelated"] }).percent).toBe(33);
  });
  it.for([
    input({ expectedCatalog: "old catalog" }),
    input({ milestoneId: "unknown" }),
    input({ expectedProgress: progress({ user_id: otherUser }) }),
    input({ expectedProgress: progress({ path_id: otherPath }) }),
  ])("rejects unobserved/foreign state or a changed catalog", (request) =>
    expect(() => learningChange(request, learningPath(), uid)).toThrow(),
  );
  it.for([
    {},
    { pathId: pid, milestoneId: "first" },
    { ...input(), completed: undefined },
    { ...input(), expectedProgress: undefined },
    { ...input(), workspaceId },
    { ...input(), userId: otherUser },
    { ...input(), expectedUpdatedAt: earlier },
    input({ operationId: "bad" }),
    input({ completed: "true" as never }),
  ])("fails closed on old toggle or ambiguous inputs: %j", (value) =>
    expect(learningSetInputSchema.safeParse(value).success).toBe(false),
  );
});
describe("Integral receipts, not merely resolved HTTP", () => {
  it.for([
    input(),
    input({ expectedProgress: null, milestoneId: "first" }),
    input({ completed: false, milestoneId: "first" }),
    input({ completed: true, milestoneId: "first" }),
    input({ expectedProgress: null, completed: false }),
  ])("confirms create/update/unmark/no-op with exact state and dates", (request) => {
    expect(confirmLearningReceipt(receipt(request), request, learningPath(), uid, at)).toEqual(
      receipt(request),
    );
  });
  it.for([
    "user_id",
    "path_id",
    "id",
    "workspace_id",
    "progress_pct",
    "completed_milestones",
    "started_at",
    "updated_at",
    "completed_at",
  ] as const)("rejects a changed updated receipt field %s", (field) => {
    const value = receipt();
    const changes = {
      user_id: otherUser,
      path_id: otherPath,
      id: operationId,
      workspace_id: null,
      progress_pct: 99,
      completed_milestones: ["first", "second"],
      started_at: at,
      updated_at: earlier,
      completed_at: null,
    };
    expect(() =>
      confirmLearningReceipt(
        { ...value, progress: { ...value.progress, [field]: changes[field] } },
        input(),
        learningPath(),
        uid,
      ),
    ).toThrow();
  });
  it.for([
    null,
    undefined,
    {},
    [],
    { ...receipt(), progress: null },
    { ...receipt(), operationId: otherUser },
    { ...receipt(), mode: "created" },
    { ...receipt(), catalogVersion: "old" },
    { ...receipt(), pathId: otherPath },
    { ...receipt(), recordedAt: null },
  ])("does not treat incomplete/mismatched receipts as success: %j", (value) =>
    expect(() => confirmLearningReceipt(value, input(), learningPath(), uid)).toThrow(),
  );
  it("checks the known server write instant when provided", () =>
    expect(() =>
      confirmLearningReceipt(receipt(), input(), learningPath(), uid, earlier),
    ).toThrow());
  it.for(["id", "workspace_id", "started_at", "updated_at"] as const)(
    "checks created receipt %s against the explicit creation",
    (field) => {
      const request = input({ expectedProgress: null, milestoneId: "first" }),
        value = receipt(request);
      expect(() =>
        confirmLearningReceipt(
          {
            ...value,
            progress: {
              ...value.progress,
              [field]:
                field === "id" ? otherUser : field === "workspace_id" ? workspaceId : earlier,
            },
          },
          request,
          learningPath(),
          uid,
        ),
      ).toThrow();
    },
  );
  it("requires removal of completion date when a milestone is unmarked", () => {
    const request = input({ milestoneId: "first", completed: false });
    const value = receipt(request);
    expect(value.progress?.completed_at).toBeNull();
    expect(() =>
      confirmLearningReceipt(
        { ...value, progress: { ...value.progress, completed_at: at } },
        request,
        learningPath(),
        uid,
      ),
    ).toThrow();
  });
  it("does not use a no-op to silently normalize legacy percentage/date", () => {
    const request = input({ milestoneId: "first", completed: true });
    const value = receipt(request);
    expect(value.progress?.progress_pct).toBe(175);
    expect(value.recordedAt).toBeNull();
    expect(() =>
      confirmLearningReceipt(
        { ...value, progress: { ...value.progress, progress_pct: 50 } },
        request,
        learningPath(),
        uid,
      ),
    ).toThrow();
    expect(() =>
      confirmLearningReceipt({ ...value, recordedAt: at }, request, learningPath(), uid),
    ).toThrow();
  });
});
describe("Version precision and timezone equivalence", () => {
  it.each([
    [earlier, "2026-11-12T11:00:00.123456-03:00", true],
    [earlier, "2026-11-12T14:00:00.123457Z", false],
    [earlier, "2026-11-12T14:00:00.123Z", false],
    ["2026-11-12T14:00:00.100000Z", "2026-11-12T14:00:00.1+00:00", true],
    [at, "2026-11-12T12:00:00-03:00", true],
    ["bad", "bad", false],
  ])("compares %s / %s without millisecond loss", (a, b, expected) =>
    expect(learningSameInstant(a, b)).toBe(expected),
  );
  it("compares full personal state with timezone-equivalent versions and notices microseconds", () => {
    expect(
      learningProgressEqual(
        progress(),
        progress({ updated_at: "2026-11-12T11:00:00.123456-03:00" }),
      ),
    ).toBe(true);
    expect(
      learningProgressEqual(progress(), progress({ updated_at: "2026-11-12T14:00:00.123457Z" })),
    ).toBe(false);
    expect(learningProgressEqual(null, progress())).toBe(false);
  });
  it("rejects an updated receipt with only a different timezone spelling of the expected version", () => {
    const value = receipt();
    expect(() =>
      confirmLearningReceipt(
        {
          ...value,
          progress: { ...value.progress, updated_at: "2026-11-12T11:00:00.123456-03:00" },
        },
        input(),
        learningPath(),
        uid,
      ),
    ).toThrow();
  });
});

describe("Expected learning account at strict boundaries", () => {
  it("does not accept a confirmed batch for a different requested account", () => {
    expect(() =>
      confirmLearningProgressBatch(batch(), { accountId: otherUser, pathIds: [pid] }, uid),
    ).toThrow();
  });
  it("does not accept a new personal change attributed to an old account", () => {
    expect(() =>
      learningChange(input({ accountId: otherUser, expectedProgress: null }), learningPath(), uid),
    ).toThrow();
  });
});
