import { createFileRoute } from "@tanstack/react-router";
import { modulePageHead } from "@/lib/page-head";
import { NavigatorPage } from "@/features/navigator/NavigatorPage";

export const Route = createFileRoute("/_authenticated/app/navigator")({
  head: () => modulePageHead("navigator"),
  component: NavigatorPage,
});
