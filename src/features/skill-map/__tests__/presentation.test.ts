import { describe, expect, it } from "vitest";
import {
  assessment,
  at,
  otherUser,
  otherWorkspace,
  snapshot,
  uid,
  workspaceId,
} from "@/lib/skill-map/__tests__/fixtures";
import {
  canReadSkillMap,
  skillBand,
  skillDate,
  skillDraftSchema,
  skillEditor,
  skillEditorMatches,
  skillNeedsSave,
  skillOperationScope,
  skillQueryKey,
  skillReadState,
  skillStats,
  skillViewKey,
} from "../presentation";

describe("Skill Map personal workspace presentation", () => {
  it.each(["owner", "admin", "editor", "viewer"])("a recognized %s may use their own map", (role) =>
    expect(canReadSkillMap(role)).toBe(true),
  );
  it.for([null, undefined, "", "OWNER", "administrator", 0, {}, ["viewer"]])(
    "unknown membership is not permission",
    (role) => expect(canReadSkillMap(role)).toBe(false),
  );
  it("separates record/view/operation state by both account and workspace, without collision", () => {
    const keys = [
      skillQueryKey(uid, workspaceId),
      skillQueryKey(otherUser, workspaceId),
      skillQueryKey(uid, otherWorkspace),
      skillViewKey(uid, workspaceId),
      skillViewKey(otherUser, workspaceId),
      skillViewKey(uid, otherWorkspace),
    ];
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(6);
    expect(skillOperationScope(uid, workspaceId)).not.toBe(
      skillOperationScope(otherUser, workspaceId),
    );
    expect(skillOperationScope(uid, workspaceId)).not.toBe(
      skillOperationScope(uid, otherWorkspace),
    );
    expect(skillOperationScope("a:b", "c")).not.toBe(skillOperationScope("a", "b:c"));
  });
  it.each([
    [undefined, false, "loading"],
    [undefined, true, "error"],
    [snapshot(), true, "stale"],
    [snapshot({ items: [], total: 0 }), false, "ready"],
  ])("does not confuse loading/error/empty/stale", (data, isError, expected) =>
    expect(skillReadState({ data, isError: isError as boolean })).toBe(expected),
  );
  it.each([
    [null, "unassessed"],
    [0, "low"],
    [29, "low"],
    [30, "middle"],
    [79, "middle"],
    [80, "high"],
    [100, "high"],
  ] as const)("a score of %s remains an explicit declared band", (score, expected) =>
    expect(skillBand(score)).toBe(expected),
  );
  it("an absent assessment starts blank, never an implicit zero or fake mastery", () =>
    expect(skillEditor("copy", null)).toMatchObject({
      area: "copy",
      score: "",
      notes: "",
      expected: null,
      step: "edit",
    }));
  it("prefills a real zero, all original notes and metadata, without truncation/rounding", () => {
    const row = assessment({ score: 0, notes: "  " + "λ".repeat(701), confidence: 1.25 });
    const editor = skillEditor("copy", row);
    expect(editor.score).toBe("0");
    expect(editor.notes).toBe(row.notes);
    expect(editor.expected).toEqual(row);
    expect(skillDraftSchema.safeParse({ score: editor.score, notes: editor.notes }).success).toBe(
      false,
    );
  });
  it.for(["0", "1", "29", "30", "79", "80", "99", "100", "000", " 5 "])(
    "accepts full integer draft %j",
    (score) => expect(skillDraftSchema.parse({ score, notes: "" }).score).toBe(Number(score)),
  );
  it.for(["", " ", "-1", "101", "1.1", "1,1", "1e2", "NaN", "Infinity", "1000"])(
    "does not coerce an invalid draft to zero %j",
    (score) => expect(skillDraftSchema.safeParse({ score, notes: "" }).success).toBe(false),
  );
  it("only explicit empty notes become null; other whitespace and text stay exact", () => {
    expect(skillDraftSchema.parse({ score: "0", notes: "" }).notes).toBeNull();
    expect(skillDraftSchema.parse({ score: "0", notes: "  text \n " }).notes).toBe("  text \n ");
    expect(skillDraftSchema.safeParse({ score: "0", notes: "x".repeat(501) }).success).toBe(false);
  });
  it("matches the complete original row instead of only its score/date", () => {
    const editor = skillEditor("copy", assessment());
    expect(skillEditorMatches(editor, snapshot())).toBe(true);
    expect(skillEditorMatches(editor, undefined)).toBe(false);
    expect(skillEditorMatches(editor, snapshot({ items: [assessment({ evidence: {} })] }))).toBe(
      false,
    );
    expect(skillEditorMatches(editor, snapshot({ items: [], total: 0 }))).toBe(false);
  });
  it("confirmed absence may match, but an appeared record invalidates it", () => {
    const editor = skillEditor("copy", null);
    expect(skillEditorMatches(editor, snapshot({ items: [], total: 0 }))).toBe(true);
    expect(skillEditorMatches(editor, snapshot())).toBe(false);
  });
  it("knows when a self record is identical without pretending an inferred source is self", () => {
    const draft = { score: 45, notes: assessment().notes };
    expect(skillNeedsSave(skillEditor("copy", assessment()), draft)).toBe(false);
    expect(skillNeedsSave(skillEditor("copy", assessment({ source: "inferred" })), draft)).toBe(
      true,
    );
    expect(skillNeedsSave(skillEditor("copy", null), { score: 0, notes: null })).toBe(true);
  });
  it("empty/zero/high stats count records only and never declare mastered skills", () => {
    expect(skillStats(snapshot({ total: 0, items: [] }))).toEqual({
      assessed: 0,
      unassessed: 10,
      high: 0,
    });
    expect(skillStats(snapshot({ items: [assessment({ score: 0 })] }))).toEqual({
      assessed: 1,
      unassessed: 9,
      high: 0,
    });
    expect(skillStats(snapshot({ items: [assessment({ score: 80 })] })).high).toBe(1);
  });
  it("formats the explicit SãoPaulo date independently from environment/client timezone", () => {
    expect(skillDate(at, "pt-BR")).toContain("12:04");
    expect(skillDate("2026-11-12T01:00:00Z", "en-US")).toMatch(/Nov 11, 2026/);
    expect(skillDate("invalid", "pt-BR")).toBeNull();
  });
});
