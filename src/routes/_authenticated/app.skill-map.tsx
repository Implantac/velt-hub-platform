import { createFileRoute } from "@tanstack/react-router";
import { modulePageHead } from "@/lib/page-head";
import { SkillMapPage } from "@/features/skill-map/SkillMapPage";

export const Route = createFileRoute("/_authenticated/app/skill-map")({
  head: () => modulePageHead("skill_map"),
  component: SkillMapPage,
});
