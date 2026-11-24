import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { learningCatalogVersion } from "@/lib/learning/contracts";
import { at, learningPath, otherUser, pid, progress, uid } from "@/lib/learning/__tests__/fixtures";
import {
  learningCatalogKey,
  learningDate,
  learningIntentMatches,
  learningLastPage,
  learningProgressKey,
  learningViewKey,
  type LearningIntent,
} from "../presentation";
const intent: LearningIntent = {
  pathId: pid,
  milestoneId: "second",
  completed: true,
  expectedCatalog: learningCatalogVersion(learningPath()),
  expectedProgress: progress(),
  observedPath: learningPath(),
};
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
describe("Learning presentation and personal scope", () => {
  it.each([
    learningViewKey,
    (id: string) => learningCatalogKey(id, 1),
    (id: string) => learningProgressKey(id, [learningPath()]),
  ])("isolates cache keys by account, not workspace", (key) => {
    expect(key(uid)).not.toEqual(key(otherUser));
    expect(key(uid)).toContain(uid);
    expect(key(uid)).not.toContain("workspace");
  });
  it("keeps catalog pages and content-aware progress batches independent", () => {
    expect(learningCatalogKey(uid, 1)).not.toEqual(learningCatalogKey(uid, 2));
    expect(learningProgressKey(uid, [learningPath()])).not.toEqual(
      learningProgressKey(uid, [learningPath({ title: "changed" })]),
    );
  });
  it("compares the exact observed intent without changing it", () => {
    const before = structuredClone(intent);
    expect(learningIntentMatches(intent, learningPath(), progress())).toBe(true);
    expect(intent).toEqual(before);
  });
  it.each([
    undefined,
    learningPath({ title: "changed" }),
    learningPath({ milestones: [{ id: "first", title: "Only first" }] }),
  ])("blocks a missing/changed current catalog", (path) =>
    expect(learningIntentMatches(intent, path, progress())).toBe(false),
  );
  it.each([
    undefined,
    null,
    progress({ progress_pct: 0 }),
    progress({ user_id: otherUser }),
    progress({ updated_at: at }),
  ])("does not rebase/overwrite an unconfirmed or changed row", (row) =>
    expect(learningIntentMatches(intent, learningPath(), row)).toBe(false),
  );
  it.each([
    [0, 1],
    [1, 1],
    [20, 1],
    [21, 2],
    [41, 3],
  ])("computes last page from total %s", (total, expected) =>
    expect(learningLastPage({ total, pageSize: 20 })).toBe(expected),
  );
  it.each(["pt-BR", "en-US"])(
    "formats saved time in São Paulo even with a different host TZ: %s",
    (language) => expect(learningDate(at, language)).toContain("12:00"),
  );
  it("keeps route composition and shared metadata, without local RPCs/logic", () => {
    const route = source("../../../routes/_authenticated/app.learning.tsx");
    expect(route).toContain('modulePageHead("learning")');
    expect(route).toContain("component: LearningPage");
    expect(route).not.toContain("useQuery");
    expect(route).not.toContain("useMutation");
  });
  it("defines ephemeral account memory, disabled for network with five-minute inactive GC", () => {
    const hook = source("../hooks/use-learning.ts");
    expect(hook).toContain("learningViewKey(userId)");
    expect(hook).toContain("enabled: false");
    expect(hook).toContain("gcTime: 5 * 60 * 1000");
    expect(hook).toContain("staleTime: Infinity");
    expect(hook).not.toContain("localStorage");
    expect(hook).not.toContain("useMutation");
    expect(hook).toContain("if (!mounted.current) return false;");
  });
  it("does not add AI, skill, score, onboarding, persistence or workspace side effects", () => {
    const api = source("../../../lib/api/learning.functions.ts"),
      operation = source("../../../lib/learning/operations.server.ts");
    expect(api).not.toContain(".upsert(");
    expect(operation).not.toContain(".upsert(");
    for (const name of [
      "runAI",
      "service_role",
      "onboarding_completed",
      "digital_scores",
      "skill_assessments",
      "requireWorkspaceRole",
    ])
      expect(api + operation).not.toContain(name);
  });
});
