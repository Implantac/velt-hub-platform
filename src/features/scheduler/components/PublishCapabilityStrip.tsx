import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { GrowthService } from "@/lib/services";
import { PublishConfiguration, type PublishingCapability } from "./PublishConfiguration";

/** Configuration readiness is not external-provider approval or homologation. */
export function PublishCapabilityStrip() {
  const { t } = useTranslation();
  const fetchCaps = useServerFn(GrowthService.getPublishCapabilities);
  const q = useQuery({
    queryKey: ["publish-caps"],
    queryFn: async () => {
      const r = await fetchCaps();
      return r as unknown as {
        platforms: PublishingCapability[];
        simulated: boolean;
        readyCount: number;
      };
    },
    staleTime: 10 * 60_000,
    retry: false,
  });

  if (q.isError)
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        {t("scheduler.capabilityError")}{" "}
        <button type="button" onClick={() => void q.refetch()} className="min-h-11 underline">
          {t("common.tryAgain")}
        </button>
      </p>
    );
  if (q.isLoading || !q.data)
    return (
      <p role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {t("scheduler.capabilityLoading")}
      </p>
    );

  return <PublishConfiguration platforms={q.data.platforms} simulated={q.data.simulated} />;
}
