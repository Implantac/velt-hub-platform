import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { Compass, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { fadeUp } from "@/components/app/motion-presets";

type Props = { onRefresh: () => void; isPending: boolean; compact?: boolean };
export function DashboardHeader({ onRefresh, isPending, compact = false }: Props) {
  const { t } = useTranslation();
  return (
    <motion.header variants={fadeUp} className="flex flex-wrap items-end justify-between gap-4">
      {!compact && (
        <div className="min-w-0">
          <div className="eyebrow-chip mb-2">
            <Compass className="size-3 text-accent" aria-hidden="true" />
            {t("dashboard.workspaceOverview")}
          </div>
          <h1 className="text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {t("dashboard.title")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onRefresh}
          disabled={isPending}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          <RefreshCw className={`size-4 ${isPending ? "animate-spin" : ""}`} aria-hidden="true" />
          {t(isPending ? "dashboard.refreshingData" : "dashboard.refreshData")}
        </button>
        <Link
          to="/app/brain"
          className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 py-3 text-sm font-semibold hover:bg-secondary"
        >
          {t("dashboard.openBrain")}
        </Link>
      </div>
    </motion.header>
  );
}
