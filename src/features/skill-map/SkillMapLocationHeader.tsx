import type { ReactNode } from "react";
import { Brain } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/app/PageHeader";

export type SkillMapPlacement = "page" | "panel";

/** Same personal data/editor in both locations, not a team report or another Brain computation. */
export function SkillMapLocationHeader({
  placement,
  action,
}: {
  placement: SkillMapPlacement;
  action: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <>
      {placement === "page" ? (
        <PageHeader
          icon={Brain}
          eyebrow={t("skillMapNative.eyebrow")}
          title={t("skillMapNative.title")}
          subtitle={t("skillMapNative.subtitle")}
          action={action}
        />
      ) : (
        <header className="flex min-w-0 flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="eyebrow-chip">{t("skillMapNative.eyebrow")}</p>
            <h2 className="text-balance text-xl font-bold tracking-tight sm:text-2xl">
              {t("skillMapNative.title")}
            </h2>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {t("skillMapNative.subtitle")}
            </p>
          </div>
          {action}
        </header>
      )}
      <div className="min-w-0 space-y-3 rounded-xl border border-border p-4 text-sm leading-relaxed">
        <p>{t("skillMapIntegration.sameMap")}</p>
        <p className="text-xs text-muted-foreground">{t("skillMapIntegration.runtime")}</p>
        {placement === "panel" ? (
          <Link
            to="/app/skill-map"
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 py-2 font-semibold underline-offset-4 hover:underline"
          >
            {t("skillMapIntegration.openPage")}
          </Link>
        ) : (
          <Link
            to="/app/brain-lab"
            search={{ tab: "skills" }}
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 py-2 font-semibold underline-offset-4 hover:underline"
          >
            {t("skillMapIntegration.openLab")}
          </Link>
        )}
      </div>
    </>
  );
}
