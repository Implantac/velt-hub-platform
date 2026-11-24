import { useTranslation } from "react-i18next";
import type { JourneyRecord } from "@/lib/coach/contracts";
import { MEMORY_META, SENTIMENT_ICON } from "../constants";
import { coachDate, nativeCoachJourney } from "../presentation";

export function JourneyTimeline({ events }: { events: JourneyRecord[] }) {
  const { t, i18n } = useTranslation();
  return (
    <ol className="min-w-0 space-y-3">
      {events.map((event) => {
        const meta = MEMORY_META[event.kind],
          Icon = meta.icon,
          native = nativeCoachJourney(event);
        const sentiment = event.sentiment ? SENTIMENT_ICON[event.sentiment] : null,
          Sentiment = sentiment?.icon;
        return (
          <li
            key={event.id}
            className="min-w-0 rounded-xl border border-border bg-card p-4 [overflow-wrap:anywhere]"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <Icon aria-hidden="true" className={`size-4 ${meta.color}`} />
              <span>{t(`coachNative.journeyKinds.${event.kind}`)}</span>
              <time className="font-normal text-muted-foreground" dateTime={event.created_at}>
                {coachDate(event.created_at, i18n.language)}
              </time>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm">
              {native ? t("coachNative.nativeEvent", { count: native.count }) : event.subject}
            </p>
            {!native && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("coachNative.journeyOriginal")}
              </p>
            )}
            {native && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("coachNative.batchReference")} <code>{native.batchId}</code>
              </p>
            )}
            {event.sentiment && (
              <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                {Sentiment && <Sentiment aria-hidden="true" className="size-4" />}
                {t("coachNative.sentiment", {
                  value: sentiment
                    ? t(`coachNative.sentiments.${event.sentiment}`)
                    : event.sentiment,
                })}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
