import { describe, expect, it } from "vitest";
import { calculation } from "@/lib/diagnostics/__tests__/fixtures";
import {
  coachAction,
  coachBrowseSchema,
  coachGenerateInputSchema,
  coachListInputSchema,
  coachMethod,
  coachState,
  coachStatusInputSchema,
  confirmCoachGeneration,
  confirmCoachPage,
  confirmCoachRecord,
  confirmCoachStatus,
  confirmJourneyPage,
  confirmSavedCoachBatch,
  journeyListInputSchema,
} from "../contracts";
import {
  at,
  id,
  input,
  journeyPage,
  later,
  legacy,
  otherWorkspace,
  page,
  receipt,
  recommendation,
  recommendations,
  userId,
  workspaceId,
} from "./fixtures";

describe("Coach contracts", () => {
  it("defaults GET inputs without silently clamping bad pages or filters", () => {
    expect(coachListInputSchema.parse({ workspaceId })).toEqual({
      workspaceId,
      page: 1,
      status: "open",
    });
    expect(journeyListInputSchema.parse({ workspaceId })).toEqual({ workspaceId, page: 1 });
    expect(coachBrowseSchema.parse({})).toEqual({ status: "open", page: 1 });
  });
  it.each([0, -1, 1.2, 100001, "2", null, Infinity])("rejects malformed page %s", (value) => {
    expect(coachBrowseSchema.safeParse({ page: value }).success).toBe(false);
    expect(journeyListInputSchema.safeParse({ workspaceId, page: value }).success).toBe(false);
  });
  it("requires caller-created batch, exact read version and a recognized manual action", () => {
    expect(coachGenerateInputSchema.safeParse({ workspaceId }).success).toBe(false);
    expect(
      coachStatusInputSchema.safeParse({ workspaceId, id: id(100), action: "complete" }).success,
    ).toBe(false);
    for (const action of ["delete", "publish", "reopen", "completed"])
      expect(
        coachStatusInputSchema.safeParse({
          workspaceId,
          id: id(100),
          expectedUpdatedAt: at,
          action,
        }).success,
      ).toBe(false);
  });
  it.each([
    [null, null, "open"],
    [later, null, "completed"],
    [null, later, "dismissed"],
    [later, later, "conflicted"],
  ] as const)(
    "keeps both historical timestamps explicit: %#",
    (completed_at, dismissed_at, state) => {
      expect(coachState(recommendation(0, { completed_at, dismissed_at }))).toBe(state);
    },
  );
  it("keeps legacy JSON/text and decimal numeric priorities without declaring v2 methodology", () => {
    const row = legacy();
    expect(confirmCoachRecord(row, workspaceId)).toEqual(row);
    expect(coachMethod(row)).toBeNull();
  });
  it.each([{}, null, { model: "other" }, { model: "velt-coach-v2", code: "unknown" }])(
    "does not downgrade declared broken Coach metadata to legacy: %#",
    (coach) => {
      expect(() =>
        confirmCoachRecord({ ...recommendation(), cta: { coach } }, workspaceId),
      ).toThrow();
    },
  );
  it.each([
    { title: "Changed promise" },
    { body: "Doubled sales" },
    { severity: "critical" as const },
    { score: 99 },
    { kind: "insight" as const },
    { created_at: later },
    { workspace_id: otherWorkspace },
    { updated_at: "invalid" },
  ])("rejects a forged rule/record field: %#", (patch) => {
    expect(() => confirmCoachRecord(recommendation(0, patch), workspaceId)).toThrow();
  });
  it.each([
    "javascript:alert(1)",
    "https://evil.invalid/app",
    "//evil.invalid/app",
    "/application",
    "/app/../login",
    "/app/%2f%2fevil.invalid",
    "/app\\evil",
    "/app/score\n",
    " /app/score",
  ])("omits unsafe saved action %s", (href) => {
    expect(coachAction(legacy(0, { cta: { href, label: "Open" } }))).toBeNull();
  });
  it("keeps exact safe internal links and supplies no fake label for missing labels", () => {
    expect(coachAction(legacy(0, { cta: { href: "/app/content?status=draft#top" } }))).toEqual({
      href: "/app/content?status=draft#top",
      label: null,
    });
  });
  it("rejects declared rules that contradict counts available in their own stored summary", () => {
    const row = recommendation();
    const method = coachMethod(row)!;
    method.coach.evidence.sources.channels = { loaded: 0, total: 0, limit: 500 };
    expect(() => confirmCoachRecord({ ...row, cta: method }, workspaceId)).toThrow("evidence");
    const inventory = recommendations()[1];
    const inventoryMethod = coachMethod(inventory)!;
    inventoryMethod.coach.evidence.sources.content = { loaded: 9, total: 9, limit: 500 };
    expect(() => confirmCoachRecord({ ...inventory, cta: inventoryMethod }, workspaceId)).toThrow(
      "evidence",
    );
  });
  it("confirms a complete scoped native page and a genuinely empty exact page", () => {
    expect(confirmCoachPage(page(), { workspaceId, page: 1, status: "open" })).toEqual(page());
    expect(
      confirmCoachPage({ ...page(), items: [], total: 0 }, { workspaceId, page: 1, status: "open" })
        .total,
    ).toBe(0);
  });
  it.each([
    { items: null, total: 0 },
    { items: [], total: null },
    { items: [], total: 4 },
    { items: [recommendation(), recommendation()], total: 2 },
    { page: 2 },
    { workspaceId: otherWorkspace },
    { status: "all" },
    { pageSize: 50 },
    { checkedAt: null },
    { items: [recommendation(0, { completed_at: later })], total: 1 },
    { items: [recommendation(0, { workspace_id: otherWorkspace })], total: 1 },
  ])("rejects an incomplete/foreign/mismatched page: %#", (patch) => {
    expect(() =>
      confirmCoachPage({ ...page(), ...patch }, { workspaceId, page: 1, status: "open" }),
    ).toThrow();
  });
  it.each(["completed", "dismissed", "conflicted", "all"] as const)(
    "confirms non-open %s history without reopening it",
    (status) => {
      const row = legacy(0, {
        completed_at: status === "dismissed" ? null : later,
        dismissed_at: status === "completed" ? null : later,
      });
      expect(
        confirmCoachPage(
          { ...page(), status, items: [row], total: 1 },
          { workspaceId, page: 1, status },
        ).items,
      ).toEqual([row]);
    },
  );
  it("confirms 20 rows of 1205, and a vanished page without inventing current items", () => {
    const items = Array.from({ length: 20 }, (_, i) => legacy(i));
    expect(
      confirmCoachPage(
        { ...page(), page: 3, items, total: 1205 },
        { workspaceId, page: 3, status: "open" },
      ).total,
    ).toBe(1205);
    expect(
      confirmCoachPage(
        { ...page(), page: 2, items: [], total: 4 },
        { workspaceId, page: 2, status: "open" },
      ).items,
    ).toEqual([]);
  });
  it("confirms independent journey pages without interpreting arbitrary payloads", () => {
    const value = journeyPage();
    expect(confirmJourneyPage(value, { workspaceId, page: 1 })).toEqual(value);
  });
  it.each([
    { items: null },
    { total: null },
    { items: [], total: 1 },
    { workspaceId: otherWorkspace },
    { page: 2 },
    { items: [journeyPage().items[0], journeyPage().items[0]], total: 2 },
  ])("rejects unconfirmed journey transport: %#", (patch) => {
    expect(() =>
      confirmJourneyPage({ ...journeyPage(), ...patch }, { workspaceId, page: 1 }),
    ).toThrow();
  });
  it("confirms full saved batch regardless of returned row order", () => {
    const rows = recommendations();
    expect(
      confirmSavedCoachBatch([...rows].reverse(), rows, input, userId, calculation().diagnostic)
        .generated,
    ).toBe(rows.length);
    expect(confirmCoachGeneration(receipt(), input, userId)).toEqual(receipt());
  });
  it.each([
    { generated: 0 },
    { generated: 3 },
    { recommendations: [] },
    { recommendations: [recommendation(), recommendation()], generated: 2 },
    { eventRecorded: undefined },
    { recommendations: recommendations().map((row) => ({ ...row, user_id: id(999) })) },
    { recommendations: recommendations().map((row) => ({ ...row, workspace_id: otherWorkspace })) },
    { recommendations: recommendations().map((row) => ({ ...row, completed_at: later })) },
    { recommendations: recommendations().map((row) => ({ ...row, updated_at: later })) },
  ])("rejects incomplete/incorrect generation acknowledgement: %#", (patch) => {
    expect(() => confirmCoachGeneration({ ...receipt(), ...patch }, input, userId)).toThrow();
  });
  it("rejects another batch reference and an inserted ID set other than the submitted set", () => {
    expect(() =>
      confirmCoachGeneration(receipt(), { ...input, batchId: id(999) }, userId),
    ).toThrow();
    expect(() =>
      confirmSavedCoachBatch(
        recommendations().map((row) => ({ ...row, id: id(Number(row.id.slice(-3)) + 500) })),
        recommendations(),
        input,
        userId,
        calculation().diagnostic,
      ),
    ).toThrow();
  });
  it.each(["complete", "dismiss"] as const)(
    "confirms the exact scoped %s result with both state and write timestamp",
    (action) => {
      const row = recommendation(0, {
        updated_at: later,
        ...(action === "complete" ? { completed_at: later } : { dismissed_at: later }),
      });
      expect(
        confirmCoachStatus(row, { workspaceId, id: row.id, expectedUpdatedAt: at, action }, later),
      ).toEqual(row);
      expect(() =>
        confirmCoachStatus(row, { workspaceId, id: row.id, expectedUpdatedAt: at, action }, at),
      ).toThrow();
    },
  );
  it.each([
    null,
    {},
    [],
    recommendation(),
    recommendation(0, { completed_at: later, dismissed_at: later }),
    recommendation(1, { completed_at: later }),
    recommendation(0, { completed_at: later, workspace_id: otherWorkspace }),
  ])("does not accept an empty/wrong/CAS-conflicted status result: %#", (value) => {
    expect(() =>
      confirmCoachStatus(value, {
        workspaceId,
        id: recommendation().id,
        expectedUpdatedAt: at,
        action: "complete",
      }),
    ).toThrow();
  });
});
