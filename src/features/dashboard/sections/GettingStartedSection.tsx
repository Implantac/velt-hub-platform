import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, FileText, Palette, Radio } from "lucide-react";
import { useTranslation } from "react-i18next";

type Counts = { brands: number; content: number; channelsConnected: number };
export function GettingStartedSection({
  counts,
  onResume,
  canEdit = false,
  canManage = false,
}: {
  counts: Counts;
  onResume?: () => void;
  canEdit?: boolean;
  canManage?: boolean;
}) {
  const { t } = useTranslation();
  const tasks = [
    { key: "brand", icon: Palette, to: "/app/brands", done: counts.brands > 0, optional: false },
    {
      key: "content",
      icon: FileText,
      to: "/app/content",
      done: counts.content > 0,
      optional: false,
    },
    {
      key: "channel",
      icon: Radio,
      to: "/app/channels",
      done: counts.channelsConnected > 0,
      optional: true,
    },
  ] as const;
  const required = tasks.filter((task) => !task.optional);
  const done = required.filter((task) => task.done).length;
  const next = required.find((task) => !task.done)?.key;
  return (
    <section aria-labelledby="getting-started-heading" className="space-y-5">
      <div className="max-w-2xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
          {t("gettingStarted.progress", { done, total: required.length })}
        </p>
        <h1 id="getting-started-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t(canEdit ? "gettingStarted.title" : "gettingStarted.readOnlyTitle")}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {t(canEdit ? "gettingStarted.subtitle" : "gettingStarted.readOnlySubtitle")}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label={t("gettingStarted.progress", { done, total: required.length })}
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={required.length}
        className="h-1.5 overflow-hidden rounded-full bg-secondary"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${(done / required.length) * 100}%` }}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {tasks.map((task) => {
          const Icon = task.done ? CheckCircle2 : task.icon;
          const actionable = canEdit && !task.optional && !task.done;
          return (
            <article
              key={task.key}
              className={`section-card flex flex-col p-5 ${actionable && task.key === next ? "border-primary/50" : ""}`}
            >
              <div className="mb-4 flex items-center justify-between gap-2">
                <Icon
                  aria-hidden="true"
                  className={`size-6 ${task.done ? "text-success" : "text-primary"}`}
                />
                {task.optional && (
                  <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                    {t("gettingStarted.optional")}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-semibold">{t(`gettingStarted.${task.key}Title`)}</h2>
              <p className="mb-5 mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {t(`gettingStarted.${task.key}Text`)}
              </p>
              <Link
                to={task.to}
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${actionable && task.key === next ? "bg-primary text-primary-foreground" : "border border-border hover:bg-secondary"}`}
              >
                {!canEdit || task.done
                  ? t("gettingStarted.view")
                  : t(`gettingStarted.${task.key}Action`)}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              {task.done && (
                <span className="mt-2 text-xs text-success">{t("gettingStarted.complete")}</span>
              )}
              {task.optional && !canManage && (
                <p className="mt-2 text-xs text-muted-foreground">{t("access.manageOnly")}</p>
              )}
            </article>
          );
        })}
      </div>
      {canEdit && onResume && (
        <button
          type="button"
          onClick={onResume}
          className="min-h-11 text-sm font-medium text-primary underline underline-offset-4"
        >
          {t("gettingStarted.resume")}
        </button>
      )}
    </section>
  );
}
