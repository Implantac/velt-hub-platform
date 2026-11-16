import { createFileRoute } from "@tanstack/react-router";
import { runSchedulerCycle } from "@/lib/scheduler/dispatcher.server";
import { handleCronPost } from "@/lib/security/cron-auth.server";

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" } as const;

export const Route = createFileRoute("/api/public/cron/scheduler-tick")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        handleCronPost(request, {
          routeName: "scheduler-tick",
          run: () => runSchedulerCycle({ limit: 20, lockSeconds: 300 }),
        }),
      GET: async () =>
        new Response(JSON.stringify({ error: "method_not_allowed" }), {
          status: 405,
          headers: { ...JSON_HEADERS, Allow: "POST" },
        }),
    },
  },
});
