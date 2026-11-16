import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, MapPin, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { GbpService } from "@/lib/services";

interface Location {
  name: string;
  accountId: string;
  locationId: string;
  locationName: string;
  address?: string;
  verified: boolean;
}
/** Initial explicit binding only. An established channel is never retargeted. */
export function BusinessLocationPicker({
  workspaceId,
  channelId,
  currentLocationId,
}: {
  workspaceId: string;
  channelId: string;
  currentLocationId?: string | null;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useServerFn(GbpService.listBusinessLocationsForChannel);
  const select = useServerFn(GbpService.selectBusinessLocation);
  const [saving, setSaving] = useState<string | null>(null);
  const bound = /^accounts\/[0-9]+\/locations\/[0-9]+$/.test(currentLocationId ?? "");
  const q = useQuery({
    queryKey: ["gbp-locations", workspaceId, channelId, currentLocationId],
    queryFn: async () =>
      (await list({ data: { workspaceId, channelId } })) as {
        locations: Location[];
        verifiedCount: number;
      },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const onSelect = async (location: Location) => {
    if (bound) return;
    setSaving(location.name);
    try {
      await select({ data: { workspaceId, channelId, locationName: location.name } });
      await Promise.all(
        ["channels", "scheduler-options", "gbp-locations"].map((key) =>
          qc.invalidateQueries({ queryKey: [key, workspaceId] }),
        ),
      );
      toast.success(t("channels.location.saved", { name: location.locationName }));
    } catch {
      toast.error(t("channels.location.saveFailed"));
    } finally {
      setSaving(null);
    }
  };
  if (q.isLoading)
    return (
      <p className="px-4 py-2 text-xs text-muted-foreground">{t("channels.location.loading")}</p>
    );
  if (q.isError)
    return (
      <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <div className="text-xs leading-relaxed text-foreground">
          <p className="font-medium">{t("channels.location.errorTitle")}</p>
          <p className="mt-0.5 text-muted-foreground">{t("channels.location.errorDescription")}</p>
          <button
            type="button"
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
            className="mt-2 min-h-11 rounded-md border px-3 text-xs"
          >
            {t("channels.location.retry")}
          </button>
        </div>
      </div>
    );
  const locations = q.data?.locations ?? [];
  if (!locations.length)
    return (
      <p className="px-4 pb-3 text-xs text-muted-foreground">{t("channels.location.empty")}</p>
    );
  return (
    <div className="mx-0 mb-3 space-y-2 rounded-lg border border-border bg-background/60 p-2">
      <div className="flex items-center gap-2 px-1 pb-1">
        <MapPin aria-hidden="true" className="size-4 shrink-0 text-accent" />
        <span className="text-xs font-medium text-foreground">{t("channels.location.title")}</span>
      </div>
      {bound && (
        <p className="px-1 text-xs text-muted-foreground">{t("channels.location.boundNotice")}</p>
      )}
      {locations.map((location) => {
        const active = currentLocationId === location.name;
        const Icon = active ? Check : location.verified ? ShieldCheck : AlertTriangle;
        return (
          <button
            key={location.name}
            type="button"
            onClick={() => void onSelect(location)}
            disabled={bound || !location.verified || saving !== null || active}
            className={`flex min-h-11 w-full items-start gap-2 rounded-md border px-3 py-3 text-left transition ${active ? "border-primary/60 bg-primary/10" : location.verified ? "border-border enabled:hover:border-primary/40 enabled:hover:bg-secondary/40" : "cursor-not-allowed border-border"}`}
          >
            <Icon
              aria-hidden="true"
              className={`mt-0.5 size-4 shrink-0 ${active ? "text-primary" : location.verified ? "text-emerald-500" : "text-amber-500"}`}
            />
            <span className="min-w-0 flex-1 break-words">
              <span className="block text-xs font-medium text-foreground">
                {location.locationName}
                {active && ` · ${t("channels.location.current")}`}
              </span>
              {location.address && (
                <span className="block text-xs text-muted-foreground">{location.address}</span>
              )}
              {!location.verified && (
                <span className="block text-xs text-foreground">
                  {t("channels.location.unverified")}
                </span>
              )}
            </span>
            {saving === location.name && (
              <span className="text-xs text-muted-foreground">{t("channels.location.saving")}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
