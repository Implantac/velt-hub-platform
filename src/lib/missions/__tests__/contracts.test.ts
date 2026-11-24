import { describe, expect, it } from "vitest";
import {
  MISSION_MAX_PAGE,
  MISSION_STATUSES,
  confirmMissionCreation,
  confirmMissionPage,
  confirmMissionStatus,
  missionCreateInputSchema,
  missionDraftSchema,
  missionListInputSchema,
  missionPageSchema,
  missionRecordSchema,
  missionStatusInputSchema,
} from "../contracts";
import { at, mission, page, userId, workspaceId } from "./fixtures";

const draft = { title: "Review drafts 0", description: "A manually reviewed goal", priority: 0 };
const input = { workspaceId, ...draft };
const statusInput = {
  workspaceId,
  id: mission().id,
  expectedStatus: "pending" as const,
  status: "done" as const,
  expectedUpdatedAt: at,
};

describe("mission inputs", () => {
  it("trims new title and description while preserving valid priority zero", () => {
    expect(
      missionDraftSchema.parse({
        title: "  Review drafts 0  ",
        description: "  Details  ",
        priority: 0,
      }),
    ).toEqual({ title: "Review drafts 0", description: "Details", priority: 0 });
    expect(missionDraftSchema.parse({ title: "Next goal" })).toEqual({
      title: "Next goal",
      description: "",
      priority: 0,
    });
  });
  it.each(["", " ", " x ", "x".repeat(161)])("rejects invalid normalized titles: %#", (title) => {
    expect(missionDraftSchema.safeParse({ ...draft, title }).success).toBe(false);
  });
  it.each(["ab", "ação", "目標", "x".repeat(160)])(
    "accepts bounded meaningful titles: %#",
    (title) => {
      expect(missionDraftSchema.safeParse({ ...draft, title }).success).toBe(true);
    },
  );
  it.each([-1, 11, 1.5, NaN, Infinity, "0"])("rejects invalid priorities: %#", (priority) => {
    expect(missionDraftSchema.safeParse({ ...draft, priority }).success).toBe(false);
  });
  it("bounds descriptions and refuses malformed workspace identifiers", () => {
    expect(missionDraftSchema.safeParse({ ...draft, description: "x".repeat(2001) }).success).toBe(
      false,
    );
    expect(missionDraftSchema.safeParse({ ...draft, description: "x".repeat(2000) }).success).toBe(
      true,
    );
    expect(missionCreateInputSchema.safeParse({ ...input, workspaceId: "wrong" }).success).toBe(
      false,
    );
  });
  it("defaults to page one/all and accepts all four real statuses", () => {
    expect(missionListInputSchema.parse({ workspaceId })).toEqual({
      workspaceId,
      status: "all",
      page: 1,
    });
    for (const status of MISSION_STATUSES) {
      expect(missionListInputSchema.safeParse({ workspaceId, status, page: 2 }).success).toBe(true);
      expect(
        missionStatusInputSchema.safeParse({
          ...statusInput,
          status,
          expectedStatus: status === "pending" ? "done" : "pending",
        }).success,
      ).toBe(true);
    }
  });
  it.each([0, -1, 1.5, MISSION_MAX_PAGE + 1, "1", Infinity])(
    "bounds the requested page: %#",
    (page) => {
      expect(missionListInputSchema.safeParse({ workspaceId, page }).success).toBe(false);
    },
  );
  it("requires an explicit different state and a precise observed version", () => {
    expect(missionStatusInputSchema.safeParse({ ...statusInput, status: "pending" }).success).toBe(
      false,
    );
    expect(
      missionStatusInputSchema.safeParse({ ...statusInput, expectedUpdatedAt: undefined }).success,
    ).toBe(false);
    expect(
      missionStatusInputSchema.safeParse({ ...statusInput, expectedUpdatedAt: "not-a-date" })
        .success,
    ).toBe(false);
    expect(missionStatusInputSchema.parse(statusInput).expectedUpdatedAt).toBe(at);
    expect(missionStatusInputSchema.safeParse({ ...statusInput, id: "wrong" }).success).toBe(false);
    expect(
      missionStatusInputSchema.safeParse({ ...statusInput, expectedStatus: "unknown" }).success,
    ).toBe(false);
  });
});

describe("bounded mission page contract", () => {
  it.each([0, 1, 20, 21, 1205])(
    "separates real page length from a confirmed total of %s",
    (total) => {
      const result = missionPageSchema.parse(page({ total }));
      expect(result.items).toHaveLength(Math.min(20, total));
      expect(result.total).toBe(total);
    },
  );
  it("accepts a last partial page and a confirmed out-of-range page without claiming an empty workspace", () => {
    expect(missionPageSchema.parse(page({ total: 21, page: 2 })).items).toHaveLength(1);
    expect(missionPageSchema.parse(page({ total: 21, page: 3 }))).toMatchObject({
      items: [],
      total: 21,
      page: 3,
    });
  });
  it.each([null, undefined, -1, 1.5, "1", Number.MAX_SAFE_INTEGER + 1])(
    "does not invent a total from malformed count: %#",
    (total) => {
      expect(missionPageSchema.safeParse({ ...page(), total }).success).toBe(false);
    },
  );
  it.each([
    { items: null },
    { items: [] },
    { items: [mission(), mission()] },
    { pageSize: 50 },
    { checkedAt: "invalid" },
    { status: "unknown" },
    { page: 0 },
    { workspaceId: "invalid" },
  ])("does not treat an invalid page as an empty successful read: %#", (patch) => {
    expect(missionPageSchema.safeParse({ ...page(), ...patch }).success).toBe(false);
  });
  it("rejects duplicate IDs, another workspace and a row from another filter", () => {
    expect(
      missionPageSchema.safeParse(page({ total: 2, items: [mission(), mission()] })).success,
    ).toBe(false);
    expect(
      missionPageSchema.safeParse(page({ items: [mission(0, { workspace_id: userId })] })).success,
    ).toBe(false);
    expect(missionPageSchema.safeParse(page({ status: "done", items: [mission()] })).success).toBe(
      false,
    );
  });
  it("checks transport request identity in addition to the intrinsic page", () => {
    const expected = { workspaceId, page: 1, status: "all" as const };
    expect(confirmMissionPage(page(), expected)).toMatchObject({ total: 1 });
    expect(() => confirmMissionPage(page(), { ...expected, workspaceId: userId })).toThrow();
    expect(() => confirmMissionPage(page(), { ...expected, page: 2 })).toThrow();
    expect(() => confirmMissionPage(page(), { ...expected, status: "done" })).toThrow();
  });
  it("preserves historical text and integer priorities without reapplying new-input constraints", () => {
    expect(
      missionRecordSchema.parse(
        mission(0, { title: " ", description: "x".repeat(2200), priority: 15, created_by: null }),
      ).title,
    ).toBe(" ");
  });
});

describe("confirmed mission writes", () => {
  it("accepts a confirmed create separately from a missing secondary event", () => {
    expect(
      confirmMissionCreation({ mission: mission(), eventRecorded: false }, input, userId),
    ).toMatchObject({ eventRecorded: false });
    const empty = { ...input, description: "" };
    expect(
      confirmMissionCreation(
        { mission: mission(0, { description: null }), eventRecorded: true },
        empty,
        userId,
      ).eventRecorded,
    ).toBe(true);
  });
  it.each([
    { workspace_id: userId },
    { title: "Not the submitted mission" },
    { description: null },
    { priority: 1 },
    { status: "done" },
    { created_by: null },
    { created_by: workspaceId },
    { id: "bad" },
  ])("rejects an incompatible create receipt before acknowledging success: %#", (patch) => {
    expect(() =>
      confirmMissionCreation(
        { mission: { ...mission(), ...patch }, eventRecorded: true },
        input,
        userId,
      ),
    ).toThrow();
  });
  it.each([null, { ok: true }, { mission: null, eventRecorded: true }, { mission: mission() }])(
    "requires a full create receipt: %#",
    (value) => {
      expect(() => confirmMissionCreation(value, input, userId)).toThrow();
    },
  );
  it("requires the requested ID, scope and final state, not an ok flag", () => {
    expect(confirmMissionStatus(mission(0, { status: "done" }), statusInput).status).toBe("done");
    for (const value of [
      null,
      { ok: true },
      mission(1, { status: "done" }),
      mission(0, { status: "done", workspace_id: userId }),
      mission(),
    ])
      expect(() => confirmMissionStatus(value, statusInput)).toThrow();
  });
  it.each(["not-a-date", "2026-02-30T12:00:00Z", "2026-11-12"])(
    "refuses corrupt persisted timestamp: %s",
    (updated_at) => {
      expect(missionRecordSchema.safeParse(mission(0, { updated_at })).success).toBe(false);
    },
  );
});
