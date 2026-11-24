import { modulePageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { PageTransition } from "@/components/app/Motion";
import { BrainLabFrame } from "@/features/brain-lab/BrainLabFrame";
import { brainLabSearch } from "@/features/brain-lab/navigation";
import { AntiScamPanel } from "@/features/brain-lab/panels/AntiScamPanel";
import { CouncilPanel } from "@/features/brain-lab/panels/CouncilPanel";
import { DecisionsPanel } from "@/features/brain-lab/panels/DecisionsPanel";
import { ExperimentsPanel } from "@/features/brain-lab/panels/ExperimentsPanel";
import { SkillsPanel } from "@/features/brain-lab/panels/SkillsPanel";
import { TimelinePanel } from "@/features/brain-lab/panels/TimelinePanel";
import { TwinPanel } from "@/features/brain-lab/panels/TwinPanel";

export const Route = createFileRoute("/_authenticated/app/brain-lab")({
  head: () => modulePageHead("brain_lab"),
  validateSearch: brainLabSearch,
  component: BrainLabPage,
});

function BrainLabPage() {
  const { tab } = Route.useSearch(),
    navigate = Route.useNavigate();
  return (
    <PageTransition>
      <BrainLabFrame
        activeTab={tab}
        onSelect={(next) => void navigate({ search: { tab: next }, resetScroll: false })}
      >
        {tab === "twin" && <TwinPanel />}
        {tab === "skills" && <SkillsPanel />}
        {tab === "experiments" && <ExperimentsPanel />}
        {tab === "decisions" && <DecisionsPanel />}
        {tab === "anti_scam" && <AntiScamPanel />}
        {tab === "council" && <CouncilPanel />}
        {tab === "timeline" && <TimelinePanel />}
      </BrainLabFrame>
    </PageTransition>
  );
}
