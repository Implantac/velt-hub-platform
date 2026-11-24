import { createFileRoute } from "@tanstack/react-router";
import { modulePageHead } from "@/lib/page-head";
import { MissionsPage } from "@/features/missions/MissionsPage";

export const Route = createFileRoute("/_authenticated/app/missions")({
  head: () => modulePageHead("missions"),
  component: MissionsPage,
});
