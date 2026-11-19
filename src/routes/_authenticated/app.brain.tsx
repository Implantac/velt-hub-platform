import { createFileRoute } from "@tanstack/react-router";
import { modulePageHead } from "@/lib/page-head";
import { BrainPage } from "@/features/brain/BrainPage";

export const Route = createFileRoute("/_authenticated/app/brain")({
  head: () => modulePageHead("brain"),
  component: BrainPage,
});
