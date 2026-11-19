import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowUpRight, Flag, GitBranch, MapPin, Rocket, Shield, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { fadeUp, stagger } from "@/components/app/motion-presets";
import type { SavedDashboardAnswer } from "@/lib/dashboard/saved-analysis";
import { dashboardActionHref, dashboardDate } from "../presentation";

const CARDS = [
  { q: "where_am_i", icon: MapPin },
  { q: "where_to_go", icon: Flag },
  { q: "whats_blocking", icon: Shield },
  { q: "next_action", icon: Rocket },
  { q: "should_pivot", icon: GitBranch },
] as const;

export function FiveQuestionsSection({ answers }: { answers: SavedDashboardAnswer[] }) {
  const { t, i18n } = useTranslation();
  return (
    <section aria-label={t("dashboard.savedAnalysis")} className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("dashboard.savedAnalysisHint")}</p>
      <motion.div variants={stagger} className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {CARDS.map(({ q, icon: Icon }) => {
          const answer = answers.find((value) => value.question === q);
          const href = dashboardActionHref(answer?.cta?.href);
          return (
            <motion.article key={q} variants={fadeUp} className="section-card p-5">
              <h2 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Icon aria-hidden="true" className="size-3 shrink-0 text-accent" />
                {t(`dashboard.questions.${q}`)}
              </h2>
              <p className="mt-3 text-base font-bold leading-tight">
                {answer?.headline ?? t("dashboard.noSavedAnswer")}
              </p>
              {answer?.body && (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{answer.body}</p>
              )}
              {answer?.aiNote && (
                <div className="mt-2 rounded-md border border-accent/30 bg-accent/5 px-2 py-2">
                  <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold">
                    <Sparkles aria-hidden="true" className="size-3 text-accent" />
                    {t("dashboard.savedAiNote")}
                  </p>
                  <p className="text-xs leading-snug">{answer.aiNote}</p>
                </div>
              )}
              {answer?.cta && href && (
                <Link
                  to={href}
                  className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  {answer.cta.label}
                  <ArrowUpRight aria-hidden="true" className="size-3" />
                </Link>
              )}
              {answer && (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  {t("dashboard.analysisAt", {
                    date:
                      dashboardDate(answer.computedAt, i18n.language) ??
                      t("dashboard.dateUnavailable"),
                  })}
                </p>
              )}
              {answer?.expired && (
                <p className="mt-1 text-xs font-medium text-warning">
                  {t("dashboard.expiredAnswer")}
                </p>
              )}
              {typeof answer?.confidence === "number" && (
                <div
                  className="mt-3 h-1 overflow-hidden rounded-full bg-secondary"
                  role="progressbar"
                  aria-label={t("dashboard.estimatedConfidence")}
                  aria-valuenow={Math.round(answer.confidence * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round(answer.confidence * 100)}%` }}
                  />
                </div>
              )}
            </motion.article>
          );
        })}
      </motion.div>
    </section>
  );
}
