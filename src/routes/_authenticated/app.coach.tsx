import { createFileRoute } from "@tanstack/react-router";
import { modulePageHead } from "@/lib/page-head";
import { CoachPage } from "@/features/coach/CoachPage";

export const Route = createFileRoute("/_authenticated/app/coach")({
  head: () => modulePageHead("coach"),
  component: CoachPage,
});
