import { describe, expect, it } from "vitest";
import {
  SKILL_AREAS,
  SKILL_METHOD,
  confirmSkillAssessment,
  confirmSkillReceipt,
  confirmSkillSnapshot,
  isSkillJson,
  skillAssessmentEqual,
  skillAssessmentFor,
  skillAssessmentSchema,
  skillChange,
  skillJsonToken,
  skillSameInstant,
  skillScopeSchema,
  skillSetInputSchema,
} from "../contracts";
import {
  assessment,
  at,
  earlier,
  input,
  operationId,
  otherUser,
  otherWorkspace,
  receipt,
  recordId,
  scope,
  snapshot,
  uid,
} from "./fixtures";

describe("Skill Map bounded current-row contracts", () => {
  it("has exactly the ten existing areas and a self-report methodology, not a certification model", () => {
    expect(new Set(SKILL_AREAS).size).toBe(10);
    expect(SKILL_METHOD).toBe("velt-skill-map-self-v1");
  });
  it.for(SKILL_AREAS)("recognizes original area %s", (area) =>
    expect(skillAssessmentSchema.parse(assessment({ area })).area).toBe(area),
  );
  it.for([0, 1, 29, 30, 79, 80, 99, 100])("preserves every integer boundary score %j", (score) =>
    expect(skillAssessmentSchema.parse(assessment({ score })).score).toBe(score),
  );
  it.for([-1, 101, 0.5, NaN, Infinity, "0", null, undefined])("rejects invalid score %j", (score) =>
    expect(skillAssessmentSchema.safeParse({ ...assessment(), score }).success).toBe(false),
  );
  it.for([
    null,
    undefined,
    [],
    {},
    { ...assessment(), area: "unknown" },
    { ...assessment(), id: "bad" },
    { ...assessment(), assessed_at: "2026-11-12" },
    { ...assessment(), notes: undefined },
    { ...assessment(), confidence: NaN },
    { ...assessment(), source: null },
    { ...assessment(), unexpected: true },
  ])("does not normalize malformed current rows: %j", (row) =>
    expect(skillAssessmentSchema.safeParse(row).success).toBe(false),
  );
  it("preserves uncalibrated legacy metadata and long original notes without truncation", () => {
    const row = assessment({
      confidence: 1.75,
      source: "<b>origem externa</b>",
      notes: "λ".repeat(700),
      evidence: [0, false, null, { text: "<script>unsafe</script>" }],
    });
    expect(skillAssessmentSchema.parse(row)).toEqual(row);
  });
  it.for([
    null,
    true,
    false,
    0,
    -1.2,
    "",
    [0, null, { a: "b" }],
    { original: false },
    JSON.parse('{"__proto__":{"literal":"preserved"}}'),
  ])("preserves valid JSON evidence %j", (value) => expect(isSkillJson(value)).toBe(true));
  it.for([
    undefined,
    NaN,
    Infinity,
    1n,
    new Date(),
    { a: undefined },
    () => 1,
    new Map(),
    "a".repeat(65_537),
    Array(8_001).fill(0),
  ])("rejects non-JSON/excessive evidence without truncation", (value) =>
    expect(isSkillJson(value)).toBe(false),
  );
  it("bounds cyclic/deep evidence instead of recurring forever", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(isSkillJson(cyclic)).toBe(false);
    let deep: unknown = 0;
    for (let i = 0; i < 30; i++) deep = { child: deep };
    expect(isSkillJson(deep)).toBe(false);
  });
  it("compares object keys semantically but preserves array order and primitive types", () => {
    expect(skillJsonToken({ b: [false, 0], a: 1 })).toBe(skillJsonToken({ a: 1, b: [false, 0] }));
    expect(skillJsonToken([1, 2])).not.toBe(skillJsonToken([2, 1]));
    expect(skillJsonToken("0")).not.toBe(skillJsonToken(0));
  });
});

describe("Skill Map complete account/workspace reads", () => {
  it("accepts only explicit account and workspace scope", () =>
    expect(skillScopeSchema.parse(scope())).toEqual(scope()));
  it.for([
    undefined,
    null,
    {},
    { workspaceId: scope().workspaceId },
    { ...scope(), accountId: "bad" },
    { ...scope(), userId: uid },
  ])("rejects incomplete/extra scope %j", (value) =>
    expect(skillScopeSchema.safeParse(value).success).toBe(false),
  );
  it("allows confirmed absence only as a valid complete zero-count snapshot", () => {
    const data = confirmSkillSnapshot(snapshot({ items: [], total: 0 }), scope(), uid);
    expect(skillAssessmentFor(data, "copy")).toBeNull();
  });
  it("retains a genuine zero score rather than treating it as absent", () =>
    expect(
      skillAssessmentFor(
        confirmSkillSnapshot(snapshot({ items: [assessment({ score: 0 })] }), scope(), uid),
        "copy",
      )?.score,
    ).toBe(0));
  it("accepts a complete ten-area map with unique IDs", () => {
    const rows = SKILL_AREAS.map((area, i) =>
      assessment({ area, id: `30000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` }),
    );
    expect(
      confirmSkillSnapshot(snapshot({ items: rows, total: 10 }), scope(), uid).items,
    ).toHaveLength(10);
  });
  it.for([
    null,
    undefined,
    [],
    {},
    snapshot({ total: 0 }),
    snapshot({ total: 2 }),
    snapshot({ total: 11 }),
    snapshot({ items: [] }),
    { ...snapshot(), total: undefined },
    { ...snapshot(), items: null },
    { ...snapshot(), items: undefined },
    snapshot({ accountId: otherUser }),
    snapshot({ workspaceId: otherWorkspace }),
    snapshot({ items: [assessment({ user_id: otherUser })] }),
    snapshot({ items: [assessment({ workspace_id: otherWorkspace })] }),
    snapshot({ total: 2, items: [assessment(), assessment({ id: operationId })] }),
    snapshot({ total: 2, items: [assessment(), assessment({ area: "sales" })] }),
    { ...snapshot(), hidden: true },
  ])("rejects a malformed/truncated/foreign/duplicate batch", (value) =>
    expect(() => confirmSkillSnapshot(value, scope(), uid)).toThrow(),
  );
  it("rejects a valid B snapshot dispatched with A as expected account", () =>
    expect(() =>
      confirmSkillSnapshot(
        snapshot({ accountId: otherUser, items: [assessment({ user_id: otherUser })] }),
        scope(),
        otherUser,
      ),
    ).toThrow());
  it.for([
    undefined,
    [],
    { ...assessment(), user_id: otherUser },
    { ...assessment(), workspace_id: otherWorkspace },
    { ...assessment(), area: "sales" },
  ])("does not treat an invalid/foreign singleton as absence", (value) =>
    expect(() => confirmSkillAssessment(value, scope(), uid, "copy")).toThrow(),
  );
});

describe("Skill Map exact base and full precision versions", () => {
  it("compares every recognized base field, including nested evidence and whitespace", () => {
    const row = assessment();
    expect(skillAssessmentEqual(row, assessment())).toBe(true);
    expect(skillAssessmentEqual(null, null)).toBe(true);
    expect(skillAssessmentEqual(row, null)).toBe(false);
  });
  it.for([
    { id: operationId },
    { user_id: otherUser },
    { workspace_id: otherWorkspace },
    { area: "sales" as const },
    { score: 0 },
    { notes: null },
    { notes: "Texto original" },
    { source: "inferred" },
    { confidence: 0.61 },
    { evidence: { legado: [false] } },
    { assessed_at: at },
  ])("detects any changed base field %j", (patch) =>
    expect(skillAssessmentEqual(assessment(), assessment(patch))).toBe(false),
  );
  it("does not mistake reordered evidence object keys for a changed base", () => {
    const a = assessment({ evidence: { a: 1, b: 2 } }),
      b = assessment({ evidence: { b: 2, a: 1 } });
    expect(skillAssessmentEqual(a, b)).toBe(true);
  });
  it.each([
    ["2026-11-12T15:04:05.123456Z", "2026-11-12T12:04:05.123456-03:00"],
    ["2026-11-12T15:04:05.100000Z", "2026-11-12T15:04:05.1Z"],
    ["2026-11-12T15:04:05Z", "2026-11-12T15:04:05.000000+00:00"],
  ])("recognizes equivalent instants %s", (a, b) => expect(skillSameInstant(a, b)).toBe(true));
  it.each([
    ["2026-11-12T15:04:05.123001Z", "2026-11-12T15:04:05.123002Z"],
    [earlier, at],
    ["invalid", "invalid"],
    ["2026-11-12T15:04:05.000001Z", "2026-11-12T15:04:05.000000Z"],
  ])("retains submillisecond differences %s", (a, b) => expect(skillSameInstant(a, b)).toBe(false));
});

describe("Skill Map explicit desired score and strict receipt", () => {
  it.for([
    null,
    undefined,
    {},
    { ...input(), accountId: "bad" },
    { ...input(), expected: undefined },
    { ...input(), notes: undefined },
    { ...input(), score: "0" },
    { ...input(), score: 101 },
    { ...input(), score: 1.5 },
    { ...input(), notes: "x".repeat(501) },
    { ...input(), source: "inferred" },
    { ...input(), confidence: 1 },
    { ...input(), evidence: {} },
  ])("rejects blind/ambiguous/uncontrolled write input", (value) =>
    expect(skillSetInputSchema.safeParse(value).success).toBe(false),
  );
  it.for([0, 1, 50, 99, 100])("accepts full integer scores explicitly: %j", (score) =>
    expect(skillSetInputSchema.parse(input({ score })).score).toBe(score),
  );
  it("distinguishes create/update/no-op without fabricating previous zero", () => {
    expect(skillChange(input({ expected: null }), uid).mode).toBe("created");
    expect(skillChange(input(), uid).mode).toBe("updated");
    expect(skillChange(input({ score: 45, notes: assessment().notes }), uid)).toMatchObject({
      mode: "unchanged",
      changed: false,
    });
  });
  it("an explicit self-report replaces source even when the score/notes stay the same", () =>
    expect(
      skillChange(
        input({
          score: 45,
          notes: assessment().notes,
          expected: assessment({ source: "inferred" }),
        }),
        uid,
      ).mode,
    ).toBe("updated"));
  it.for([
    input({ accountId: otherUser }),
    input({ expected: assessment({ user_id: otherUser }) }),
    input({ expected: assessment({ workspace_id: otherWorkspace }) }),
    input({ expected: assessment({ area: "sales" }) }),
    input({ accountId: otherUser, expected: null }),
  ])("rejects an old/foreign expected identity before a change", (request) =>
    expect(() => skillChange(request, uid)).toThrow(),
  );
  it.each([input(), input({ expected: null }), input({ score: 45, notes: assessment().notes })])(
    "accepts a fully checked receipt",
    (request) =>
      expect(confirmSkillReceipt(receipt(request), request, uid)).toEqual(receipt(request)),
  );
  it.for([
    null,
    undefined,
    {},
    [],
    { ...receipt(), operationId: recordId },
    { ...receipt(), accountId: otherUser },
    { ...receipt(), workspaceId: otherWorkspace },
    { ...receipt(), area: "sales" },
    { ...receipt(), mode: "created" },
    { ...receipt(), recordedAt: null },
    { ...receipt(), recordedAt: earlier },
    { ...receipt(), assessment: null },
    { ...receipt(), extra: true },
  ])("does not declare an invalid/foreign receipt successful", (value) =>
    expect(() => confirmSkillReceipt(value, input(), uid)).toThrow(),
  );
  it.for([
    { id: operationId },
    { user_id: otherUser },
    { workspace_id: otherWorkspace },
    { area: "sales" as const },
    { score: 1 },
    { notes: "different" },
    { source: "inferred" },
    { confidence: 0.9 },
    { evidence: {} },
    { assessed_at: earlier },
  ])("requires all saved fields and preserved metadata %j", (patch) =>
    expect(() =>
      confirmSkillReceipt(
        { ...receipt(), assessment: { ...receipt().assessment, ...patch } },
        input(),
        uid,
      ),
    ).toThrow(),
  );
  it("does not accept a same-instant version represented in another timezone", () => {
    const request = input({
      expected: assessment({ assessed_at: "2026-11-12T12:04:05.123000-03:00" }),
    });
    expect(() => confirmSkillReceipt(receipt(request), request, uid)).toThrow();
  });
  it("requires the exact server timestamp when the server verifies its returned receipt", () =>
    expect(() => confirmSkillReceipt(receipt(), input(), uid, earlier)).toThrow());
  it.for([{ id: recordId }, { confidence: 0 }, { evidence: { previous: true } }])(
    "creation must use the operation ID and declared technical defaults",
    (patch) => {
      const request = input({ expected: null });
      const result = receipt(request);
      expect(() =>
        confirmSkillReceipt(
          { ...result, assessment: { ...result.assessment, ...patch } },
          request,
          uid,
        ),
      ).toThrow();
    },
  );
  it("a no-op cannot secretly rewrite any metadata or emit a write timestamp", () => {
    const request = input({ score: 45, notes: assessment().notes }),
      result = receipt(request);
    expect(() => confirmSkillReceipt({ ...result, recordedAt: at }, request, uid)).toThrow();
    expect(() =>
      confirmSkillReceipt(
        { ...result, assessment: { ...result.assessment, evidence: {} } },
        request,
        uid,
      ),
    ).toThrow();
  });
});
