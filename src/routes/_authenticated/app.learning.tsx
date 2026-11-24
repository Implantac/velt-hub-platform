import { createFileRoute } from "@tanstack/react-router";
import { LearningPage } from "@/features/learning/LearningPage";
import { modulePageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_authenticated/app/learning")({
  head: () => modulePageHead("learning"),
  component: LearningPage,
});
