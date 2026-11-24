import type { BrainLabTab } from "./constants";

export const BRAIN_LAB_TABS = [
  "twin",
  "skills",
  "experiments",
  "decisions",
  "anti_scam",
  "council",
  "timeline",
] as const satisfies readonly BrainLabTab[];

/** URL selection only, not permission or an instruction to write/generate anything. */
export function brainLabSearch(input: Record<string, unknown>): { tab: BrainLabTab } {
  const candidate = input.tab;
  return {
    tab:
      typeof candidate === "string" && BRAIN_LAB_TABS.some((tab) => tab === candidate)
        ? (candidate as BrainLabTab)
        : "twin",
  };
}

/** Manual-activation tablist: these keys move focus; Enter/Space/click selects. */
export function brainLabFocusTarget(current: BrainLabTab, key: string): BrainLabTab | null {
  const index = BRAIN_LAB_TABS.indexOf(current);
  if (index < 0) return null;
  if (key === "Home") return BRAIN_LAB_TABS[0];
  if (key === "End") return BRAIN_LAB_TABS[BRAIN_LAB_TABS.length - 1];
  if (key === "ArrowRight") return BRAIN_LAB_TABS[(index + 1) % BRAIN_LAB_TABS.length];
  if (key === "ArrowLeft")
    return BRAIN_LAB_TABS[(index + BRAIN_LAB_TABS.length - 1) % BRAIN_LAB_TABS.length];
  return null;
}
