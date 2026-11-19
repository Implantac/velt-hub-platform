import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to saved Brain changes for a workspace. Dashboard reads have their
 * own user-keyed cache; prefix invalidation also reaches those scoped entries.
 */
export function useBrainRealtime(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!workspaceId) return;
    // Realtime needs a WebSocket. SSR/locked-down browsers can rely on refetch.
    if (typeof globalThis.WebSocket !== "function") return;
    const filter = `workspace_id=eq.${workspaceId}`;
    const channel = supabase
      .channel(`brain-${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "brain_snapshots", filter },
        () => {
          qc.invalidateQueries({ queryKey: ["brain-all", workspaceId] });
          qc.invalidateQueries({ queryKey: ["score", workspaceId] });
          qc.invalidateQueries({ queryKey: ["health", workspaceId] });
          qc.invalidateQueries({ queryKey: ["dashboard", workspaceId] });
          qc.invalidateQueries({ queryKey: ["dashboard-analysis", workspaceId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "brain_answers", filter },
        () => {
          qc.invalidateQueries({ queryKey: ["brain-all", workspaceId] });
          qc.invalidateQueries({ queryKey: ["dashboard-analysis", workspaceId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "brain_memory_events", filter },
        () => {
          qc.invalidateQueries({ queryKey: ["coach-timeline", workspaceId] });
          qc.invalidateQueries({ queryKey: ["dashboard-journey", workspaceId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "coach_recommendations", filter },
        () => {
          qc.invalidateQueries({ queryKey: ["recs", workspaceId] });
          qc.invalidateQueries({ queryKey: ["dashboard-recommendations", workspaceId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, qc]);
}
