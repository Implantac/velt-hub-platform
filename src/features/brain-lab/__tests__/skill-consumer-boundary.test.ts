import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAIN_LAB_TABS } from "../navigation";

const root = join(process.cwd(), "src");
const source = (path: string) => readFileSync(join(root, path), "utf8");
function clientSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "__tests__") return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? clientSources(path) : /\.tsx?$/.test(path) ? [path] : [];
  });
}

describe("Skill Map consumer migration boundary, not removal of a server API", () => {
  it("Brain Lab Skills and the native page are thin adapters to the same surface", () => {
    for (const [path, placement] of [
      ["features/brain-lab/panels/SkillsPanel.tsx", "panel"],
      ["features/skill-map/SkillMapPage.tsx", "page"],
    ]) {
      const text = source(path);
      expect(text).toContain("SkillMapSurface");
      expect(text).toContain(`placement="${placement}"`);
      expect(text).not.toMatch(
        /useState|useServerFn|useWorkspaceQuery|useWorkspaceMutation|\.mutate\(/,
      );
      expect(text).not.toMatch(
        /brain-evolution\.functions|upsertSkillAssessment|listSkillAssessments/,
      );
    }
  });
  it("no known production UI source still imports either legacy skill endpoint", () => {
    const offenders = ["features", "components", "routes"].flatMap((directory) =>
      clientSources(join(root, directory)).filter((file) =>
        /\b(?:upsertSkillAssessment|listSkillAssessments)\b/.test(readFileSync(file, "utf8")),
      ),
    );
    expect(offenders.map((file) => relative(root, file))).toEqual([]);
  });
  it("surface delegates every operation to the existing user/workspace hook, not a placement-specific writer", () => {
    const text = source("features/skill-map/SkillMapSurface.tsx");
    expect(text).toContain("useSkillMap(userId, workspaceId)");
    expect(text).toContain("useWorkspaceAccess()");
    expect(text).toContain("canReadSkillMap(access.role)");
    expect(text).not.toMatch(
      /useServerFn|useWorkspaceMutation|brain-evolution\.functions|\.from\(/,
    );
    expect(text).not.toContain("useSkillMap(userId, workspaceId,");
    expect(text).toContain('placement === "panel" ? "h3" : "h2"');
  });
  it("native hook remains the sole skill form transport and still validates receipts/account before RPC", () => {
    const text = source("features/skill-map/hooks/use-skill-map.ts");
    expect(text).toContain('from "@/lib/api/skill-map.functions"');
    expect(text).toContain("skillAccountRequest(userId,");
    expect(text).toContain("confirmSkillReceipt(await forAccount(");
    expect(text).toContain('refetchType: "none"');
    expect(text).not.toMatch(
      /brain-evolution\.functions|upsertSkillAssessment|emitMemoryEvent|localStorage/,
    );
  });
  it("the validated route mounts only its explicitly selected panel and retains module metadata", () => {
    const text = source("routes/_authenticated/app.brain-lab.tsx");
    expect(text).toContain("validateSearch: brainLabSearch");
    expect(text).toContain("Route.useSearch()");
    expect(text).toContain('modulePageHead("brain_lab")');
    expect(text).toContain("resetScroll: false");
    for (const tab of BRAIN_LAB_TABS) expect(text).toContain(`tab === "${tab}" && <`);
    expect(text).not.toContain("useState");
    expect(text).not.toContain("useServerFn");
  });
  it("legacy server exports remain explicit, rather than claiming remote removal/fix", () => {
    const text = source("lib/api/brain-evolution.functions.ts");
    expect(text).toContain("export const listSkillAssessments =");
    expect(text).toContain("export const upsertSkillAssessment =");
  });
});
