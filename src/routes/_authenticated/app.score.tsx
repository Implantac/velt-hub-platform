import { createFileRoute } from "@tanstack/react-router";
import { modulePageHead } from "@/lib/page-head";
import { DiagnosticPage } from "@/features/diagnostics/DiagnosticPage";

export const Route = createFileRoute("/_authenticated/app/score")({
  head: () => modulePageHead("score"),
  component: ScorePage,
});
function ScorePage() {
  return <DiagnosticPage kind="score" />;
}
