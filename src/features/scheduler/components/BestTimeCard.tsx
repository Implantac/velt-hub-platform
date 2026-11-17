import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, RefreshCw } from "lucide-react";
import { getBestTimeToPost } from "@/lib/api/growth.functions";
import { PUBLISH_ENABLED, PLATFORM_RULES, isPlatformId } from "@/lib/growth/platform-rules";
import { browserTimeZone, isTimeZone } from "@/lib/time-zones";
import { useSchedulingOptions } from "../hooks/useSchedulingOptions";
import { parseTimingResult, timingContext } from "../best-time";
import { BestTimeResult } from "./BestTimeResult";

export function BestTimeCard({
  canEdit,
  busy,
  onUseTime,
}: {
  canEdit: boolean;
  busy: boolean;
  onUseTime: (at: string) => void;
}) {
  const { t } = useTranslation();
  const options = useSchedulingOptions();
  const fetchBest = useServerFn(getBestTimeToPost);
  const [selection, setSelection] = useState("");
  const [timeZone, setTimeZone] = useState(browserTimeZone);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const context = timingContext(selection, options.data?.channels ?? []);
  const q = useQuery({
    queryKey: [
      "best-time",
      options.wsId,
      context?.platform,
      context?.channelId ?? "reference",
      timeZone,
    ],
    queryFn: async () => {
      const raw = await fetchBest({ data: { workspaceId: options.wsId!, ...context!, timeZone } });
      return parseTimingResult(raw, options.wsId!, context!, timeZone);
    },
    enabled: !!options.wsId && !!context && !options.isError && !!options.data,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const zones = [
    ...new Set([
      browserTimeZone(),
      "UTC",
      "America/Sao_Paulo",
      "America/Manaus",
      "America/New_York",
      "Europe/Lisbon",
      "Europe/London",
      "Asia/Kolkata",
      "Asia/Kathmandu",
      "Asia/Tokyo",
      "Australia/Lord_Howe",
      "Pacific/Auckland",
    ]),
  ].filter(isTimeZone);
  return (
    <section aria-labelledby="best-time-heading" className="section-card min-w-0 space-y-4 p-5">
      <h2 id="best-time-heading" className="flex items-center gap-2 text-sm font-semibold">
        <CalendarClock aria-hidden="true" className="size-4 shrink-0 text-accent" />
        {t("bestTime.title")}
      </h2>
      <p className="text-xs leading-relaxed text-muted-foreground">{t("bestTime.intro")}</p>
      {options.isError ? (
        <div role="alert" className="space-y-2 text-sm">
          <p>{t("bestTime.optionsError")}</p>
          <button
            type="button"
            disabled={options.isFetching}
            onClick={() => void options.refetch()}
            className="min-h-11 rounded-md border border-border px-3 py-2 disabled:opacity-50"
          >
            {t("bestTime.retry")}
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <label
              htmlFor="best-time-context"
              className="block min-w-0 space-y-1.5 text-xs font-medium"
            >
              <span>{t("bestTime.context")}</span>
              <select
                id="best-time-context"
                value={selection}
                onChange={(e) => setSelection(e.target.value)}
                disabled={options.isPending}
                aria-describedby="best-time-context-hint"
                className="min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{t("bestTime.chooseContext")}</option>
                {(options.data?.channels.length ?? 0) > 0 && (
                  <optgroup label={t("bestTime.workspaceChannels")}>
                    {options.data?.channels
                      .filter((c) => isPlatformId(c.platform))
                      .map((c) => (
                        <option key={c.id} value={`channel:${c.id}`}>
                          {PLATFORM_RULES[c.platform as keyof typeof PLATFORM_RULES].label} ·{" "}
                          {c.handle || t("bestTime.unnamedChannel")}
                        </option>
                      ))}
                  </optgroup>
                )}
                <optgroup label={t("bestTime.platformReferences")}>
                  {[...PUBLISH_ENABLED].map((p) => (
                    <option key={p} value={`reference:${p}`}>
                      {PLATFORM_RULES[p].label} · {t("bestTime.reference")}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <p
              id="best-time-context-hint"
              className="text-xs leading-relaxed text-muted-foreground"
            >
              {t("bestTime.contextHint")}
            </p>
            <label
              htmlFor="best-time-zone"
              className="block min-w-0 space-y-1.5 text-xs font-medium"
            >
              <span>{t("bestTime.timeZone")}</span>
              <select
                id="best-time-zone"
                value={timeZone}
                onChange={(e) => setTimeZone(e.target.value)}
                aria-describedby="best-time-zone-hint"
                className="min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {zones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </label>
            <p id="best-time-zone-hint" className="text-xs leading-relaxed text-muted-foreground">
              {t("bestTime.zoneHint")}
            </p>
          </div>
          {options.isPending ? (
            <p role="status" className="text-xs text-muted-foreground">
              {t("bestTime.loadingOptions")}
            </p>
          ) : !context ? (
            <p role="status" className="text-xs leading-relaxed text-muted-foreground">
              {t(selection ? "bestTime.selectAgain" : "bestTime.noSelection")}
            </p>
          ) : (
            <>
              <button
                type="button"
                disabled={q.isFetching}
                onClick={() => void q.refetch()}
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 py-2 text-xs disabled:opacity-50"
              >
                <RefreshCw aria-hidden="true" className="size-3.5" />
                {t("bestTime.refresh")}
              </button>
              {q.isFetching && (
                <p role="status" className="text-xs text-muted-foreground">
                  {t("bestTime.loading")}
                </p>
              )}
              {q.isError ? (
                <p role="alert" className="text-sm leading-relaxed">
                  {t("bestTime.error")}
                </p>
              ) : (
                q.data && (
                  <BestTimeResult
                    data={q.data}
                    now={now}
                    canEdit={canEdit}
                    pending={q.isFetching || busy}
                    onUseTime={onUseTime}
                  />
                )
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
