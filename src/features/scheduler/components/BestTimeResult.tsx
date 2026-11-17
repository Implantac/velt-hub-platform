import { useTranslation } from "react-i18next";
import { BarChart3, Info, Sparkles } from "lucide-react";
import type { TimingRecommendation } from "@/lib/growth/timing";
import { formatZonedInstant } from "@/lib/time-zones";

interface Props {
  data: TimingRecommendation;
  now: number;
  canEdit: boolean;
  pending: boolean;
  onUseTime: (at: string) => void;
}
/** Only structured, context-checked results reach this presentation component. */
export function BestTimeResult({ data, now, canEdit, pending, onUseTime }: Props) {
  const { t, i18n } = useTranslation();
  const fmt = (at: string) => formatZonedInstant(at, i18n.language, data.timeZone);
  const observed = data.best.confidence === "observed";
  const future = Date.parse(data.best.at) > now + 60_000;
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex min-h-7 items-center gap-1 rounded-full border border-border bg-secondary px-2 py-1 text-xs text-foreground">
          {observed ? (
            <BarChart3 aria-hidden="true" className="size-3" />
          ) : (
            <Info aria-hidden="true" className="size-3" />
          )}
          {t(observed ? "bestTime.observed" : "bestTime.baseline")}
        </span>
        {data.channel && data.channel.status !== "connected" && (
          <span className="text-xs text-muted-foreground">{t("bestTime.disconnected")}</span>
        )}
      </div>
      <p className="break-words text-xs leading-relaxed text-muted-foreground">
        {data.channel
          ? t(observed ? "bestTime.observedReason" : "bestTime.channelBaselineReason", {
              count: data.observationsCount,
              samples: data.best.samples,
            })
          : t("bestTime.referenceReason")}
      </p>
      <div>
        <h3 className="text-xs font-medium text-muted-foreground">{t("bestTime.nextWindow")}</h3>
        <time
          dateTime={data.best.at}
          className="mt-1 block text-base font-semibold leading-relaxed [overflow-wrap:anywhere]"
        >
          {fmt(data.best.at)}
        </time>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("bestTime.zoneShown", { timeZone: data.timeZone })}
        </p>
      </div>
      {canEdit ? (
        <div className="space-y-2">
          <button
            type="button"
            disabled={pending || !future}
            onClick={() => {
              if (Date.parse(data.best.at) > Date.now() + 60_000) onUseTime(data.best.at);
            }}
            className="min-h-11 w-full rounded-lg border border-primary/50 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            {t("bestTime.useTime")}
          </button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t(future ? "bestTime.fillOnly" : "bestTime.expired")}
          </p>
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">{t("bestTime.readonly")}</p>
      )}
      {data.topSlots.length > 1 && (
        <div>
          <h3 className="text-xs font-medium text-muted-foreground">
            {t("bestTime.otherWindows")}
          </h3>
          <ul className="mt-2 space-y-2">
            {data.topSlots.slice(0, 4).map((slot) => (
              <li
                key={`${slot.weekday}-${slot.hour}`}
                className="rounded-lg border border-border/60 px-3 py-2 text-xs"
              >
                <time dateTime={slot.at} className="block leading-relaxed [overflow-wrap:anywhere]">
                  {fmt(slot.at)}
                </time>
                <span className="mt-1 block text-muted-foreground">
                  {slot.confidence === "observed"
                    ? t("bestTime.slotSamples", { count: slot.samples })
                    : t("bestTime.baseline")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="rounded-lg border border-border bg-background/60 px-3 py-3">
        <h3 className="flex items-start gap-2 text-xs font-medium">
          <Sparkles aria-hidden="true" className="size-3.5 shrink-0" />
          {t("bestTime.cadence", { count: data.cadence.perWeek })}
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {t(`bestTime.cadenceReason_${data.cadence.reasonCode}`, {
            hours: data.cadence.hoursPerWeek,
          })}
        </p>
      </div>
      <div className="border-t border-border pt-3">
        <h3 className="text-xs font-medium text-muted-foreground">
          {t("bestTime.editorialTitle")}
        </h3>
        <p className="mt-2 text-xs leading-relaxed">{t(`bestTime.strategy.${data.platform}`)}</p>
      </div>
      <details className="rounded-lg border border-border/60 px-3 text-xs">
        <summary className="min-h-11 cursor-pointer py-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {t("bestTime.methodTitle")}
        </summary>
        <div className="space-y-2 pb-3 leading-relaxed text-muted-foreground">
          <p>{t("bestTime.method")}</p>
          <p>
            {t("bestTime.threshold", { total: data.minimum.total, perSlot: data.minimum.perSlot })}
          </p>
          {data.channel && (
            <p>
              {t("bestTime.historyScope", { days: data.history.days, max: data.history.maxJobs })}
            </p>
          )}
          {observed && (
            <p>
              {t(data.basis === "engagement_rate" ? "bestTime.rateBasis" : "bestTime.countBasis")}
            </p>
          )}
          {data.history.latestCapturedAt && (
            <p>
              {t("bestTime.latestCollection")}{" "}
              <time dateTime={data.history.latestCapturedAt}>
                {fmt(data.history.latestCapturedAt)}
              </time>
            </p>
          )}
          <p>{t("bestTime.noGuarantee")}</p>
        </div>
      </details>
    </div>
  );
}
