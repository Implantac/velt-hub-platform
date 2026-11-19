import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Lightbulb,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MotionCard } from "@/components/app/Motion";
import { fadeUp } from "@/components/app/motion-presets";

export function RecIcon({ kind }: { kind: string }) {
  const map: Record<string, { icon: LucideIcon; color: string }> = {
    warning: { icon: AlertTriangle, color: "text-destructive" },
    insight: { icon: TrendingUp, color: "text-primary" },
    suggestion: { icon: Lightbulb, color: "text-accent" },
    next_action: { icon: CheckCircle2, color: "text-success" },
  };
  const match = map[kind] ?? map.insight;
  const Icon = match.icon;
  return (
    <div
      className={`grid size-9 shrink-0 place-items-center rounded-xl bg-background/40 ring-1 ring-border/50 ${match.color}`}
    >
      <Icon aria-hidden="true" className="size-4" />
    </div>
  );
}
export function SeverityPill({ severity }: { severity: string }) {
  const { t } = useTranslation();
  const tone =
    severity === "critical" || severity === "high"
      ? "bg-destructive/15 text-destructive"
      : severity === "medium"
        ? "bg-primary/15 text-primary"
        : "bg-secondary text-secondary-foreground";
  return (
    <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${tone}`}>
      {t(`dashboard.severity.${severity}`, { defaultValue: severity })}
    </span>
  );
}
export function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation();
  const tone =
    status === "done"
      ? "bg-success/15 text-success"
      : status === "in_progress"
        ? "bg-primary/15 text-primary"
        : status === "blocked"
          ? "bg-destructive/15 text-destructive"
          : "bg-secondary text-secondary-foreground";
  return (
    <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${tone}`}>
      {t(`dashboard.missionStates.${status}`, { defaultValue: status.replaceAll("_", " ") })}
    </span>
  );
}
export function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-card/20 px-4 py-6 text-center text-sm leading-relaxed text-muted-foreground">
      {text}
    </div>
  );
}
export function LinkAction({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="link-underline inline-flex min-h-11 shrink-0 items-center gap-1 text-xs text-primary"
    >
      {label}
      <ArrowUpRight aria-hidden="true" className="size-3" />
    </Link>
  );
}
export function Panel({
  title,
  icon: Icon,
  action,
  children,
  className = "",
}: {
  title: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={fadeUp} className={`section-card min-w-0 p-5 sm:p-6 ${className}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <Icon aria-hidden="true" className="size-4 shrink-0 text-accent" />
          <span className="tracking-tight">{title}</span>
        </h2>
        {action}
      </div>
      {children}
    </motion.div>
  );
}
export function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  to,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  to?: string;
}) {
  const body = (
    <MotionCard className="stat-tile group relative block min-w-0 overflow-hidden p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <Icon aria-hidden="true" className="size-4 text-accent" />
        {to && <ArrowUpRight aria-hidden="true" className="size-3 text-muted-foreground" />}
      </div>
      <div className="mt-3 text-xl font-bold tabular-nums tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-3xl">
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {label}
        {hint ? ` · ${hint}` : ""}
      </div>
    </MotionCard>
  );
  return to ? (
    <Link to={to} className="block min-w-0">
      {body}
    </Link>
  ) : (
    body
  );
}
