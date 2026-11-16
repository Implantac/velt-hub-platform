import { useId } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, Info } from "lucide-react";
import type { SchedulingOptions } from "@/lib/scheduler/scheduling";
import { schedulingPreparation } from "../preparation";

export function SchedulePreparation({
  options,
  canEdit,
}: {
  options: SchedulingOptions;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const state = schedulingPreparation(options, canEdit);
  const prefix = `scheduler.preparation.${state.kind}`;
  const action = state.kind === "draft" ? "draft" : state.kind === "channels" ? "channels" : null;

  return (
    <aside
      aria-labelledby={headingId}
      className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4"
    >
      <h3 id={headingId} className="flex items-start gap-2 text-sm font-semibold">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        {t(`${prefix}.title`)}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {state.kind === "channels"
          ? t(`${prefix}.${state.reason}`)
          : t(`${prefix}.body`, { count: state.availableChannels })}
      </p>
      {action && (
        <Link
          to={action === "draft" ? "/app/content" : "/app/channels"}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {t(`scheduler.preparation.${action}.action`)}
          <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
        </Link>
      )}
    </aside>
  );
}
