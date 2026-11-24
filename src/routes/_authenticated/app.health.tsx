import { createFileRoute } from "@tanstack/react-router";
import { modulePageHead } from "@/lib/page-head";
import { DiagnosticPage } from "@/features/diagnostics/DiagnosticPage";

export const Route = createFileRoute("/_authenticated/app/health")({
  head: () => modulePageHead("health"),
  component: HealthPage,
});
function HealthPage() {
  return <DiagnosticPage kind="health" />;
}
