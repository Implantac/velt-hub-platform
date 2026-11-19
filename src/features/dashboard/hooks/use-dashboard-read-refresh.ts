import { useEffect, useRef, useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { isDashboardQueryKey } from "../presentation";

/** Refetch only the currently active dashboard reads; never call a mutation/generator. */
export function useDashboardReadRefresh(workspaceId: string, userId: string) {
  const queryClient = useQueryClient();
  const mounted = useRef(false);
  const locked = useRef(false);
  const [result, setResult] = useState<"idle" | "success" | "partial">("idle");
  const [running, setRunning] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const filter = {
    predicate: (query: { queryKey: readonly unknown[] }) =>
      isDashboardQueryKey(query.queryKey, workspaceId, userId),
    type: "active" as const,
  };
  const fetching = useIsFetching(filter);
  const refresh = async () => {
    if (locked.current) return;
    locked.current = true;
    setRunning(true);
    setResult("idle");
    const queries = queryClient.getQueryCache().findAll(filter);
    try {
      await queryClient.refetchQueries(filter, { cancelRefetch: false, throwOnError: false });
      if (mounted.current)
        setResult(queries.some((query) => query.state.status === "error") ? "partial" : "success");
    } catch {
      if (mounted.current) setResult("partial");
    } finally {
      locked.current = false;
      if (mounted.current) setRunning(false);
    }
  };
  return { refresh, result, isFetching: running || fetching > 0 };
}
