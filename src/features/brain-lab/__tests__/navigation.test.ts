import { describe, expect, it } from "vitest";
import { BRAIN_LAB_TABS, brainLabFocusTarget, brainLabSearch } from "../navigation";

describe("Brain Lab URL selection is a bounded presentation choice", () => {
  it("retains the original twin default and exactly seven known panels", () => {
    expect(BRAIN_LAB_TABS).toEqual([
      "twin",
      "skills",
      "experiments",
      "decisions",
      "anti_scam",
      "council",
      "timeline",
    ]);
    expect(new Set(BRAIN_LAB_TABS).size).toBe(7);
    expect(brainLabSearch({})).toEqual({ tab: "twin" });
  });
  it.each(BRAIN_LAB_TABS)("accepts explicit %s without retaining unrelated URL input", (tab) => {
    const search = { tab, operationId: "not-a-command", score: 100, token: "not-auth" };
    expect(brainLabSearch(search)).toEqual({ tab });
    expect(search).toEqual({ tab, operationId: "not-a-command", score: 100, token: "not-auth" });
  });
  it.each([
    undefined,
    null,
    "",
    " ",
    "Skills",
    "SKILLS",
    " skills",
    "skills ",
    "skills?score=100",
    "skills#x",
    "<script>",
    "constructor",
    "__proto__",
    "toString",
    "../skills",
    "skills/twin",
    "skills\u0000",
    0,
    1,
    100,
    false,
    true,
    [],
    ["skills"],
    ["skills", "twin"],
    {},
    { tab: "skills" },
  ])("invalid tab %# falls back to twin, never an arbitrary panel/command", (tab) => {
    expect(brainLabSearch({ tab })).toEqual({ tab: "twin" });
  });
  it("does not mistake values with a custom toString for an allowed tab", () => {
    expect(brainLabSearch({ tab: { toString: () => "skills" } })).toEqual({ tab: "twin" });
  });
});

describe.each(BRAIN_LAB_TABS)("Brain Lab manual focus movement from %s", (tab) => {
  const index = BRAIN_LAB_TABS.indexOf(tab);
  it("Right focuses the next tab with wrap, not an activation instruction", () => {
    expect(brainLabFocusTarget(tab, "ArrowRight")).toBe(BRAIN_LAB_TABS[(index + 1) % 7]);
  });
  it("Left focuses the previous tab with wrap", () => {
    expect(brainLabFocusTarget(tab, "ArrowLeft")).toBe(BRAIN_LAB_TABS[(index + 6) % 7]);
  });
  it("Home and End focus stable boundaries", () => {
    expect(brainLabFocusTarget(tab, "Home")).toBe("twin");
    expect(brainLabFocusTarget(tab, "End")).toBe("timeline");
  });
  it.each(["Enter", " ", "Space", "Tab", "Escape", "ArrowUp", "ArrowDown", "a", ""])(
    "%s is not transformed into another panel selection",
    (key) => expect(brainLabFocusTarget(tab, key)).toBeNull(),
  );
});
