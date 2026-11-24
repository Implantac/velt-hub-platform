import { SkillMapSurface } from "@/features/skill-map/SkillMapSurface";

/** One canonical client workflow, cache and operation ledger, not a second legacy writer. */
export function SkillsPanel() {
  return <SkillMapSurface placement="panel" />;
}
