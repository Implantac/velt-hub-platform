import { useServerFn } from "@tanstack/react-start";
import { getSchedulingOptions } from "@/lib/api/scheduler.functions";
import { useWorkspaceQuery } from "@/lib/query/use-workspace-query";
import type { SchedulingOptions } from "@/lib/scheduler/scheduling";

/** Composer and timing context share one authorized, workspace-scoped read/cache. */
export function useSchedulingOptions() {
  const fetchOptions = useServerFn(getSchedulingOptions);
  return useWorkspaceQuery<SchedulingOptions>(
    (ws) => ["scheduler-options", ws],
    ({ workspaceId }) => fetchOptions({ data: { workspaceId } }),
  );
}
