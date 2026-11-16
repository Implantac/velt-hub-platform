import { useId } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, FlaskConical, XCircle } from "lucide-react";
import { PLATFORM_RULES, type PlatformId } from "@/lib/growth/platform-rules";

export interface PublishingCapability {
  platform: string;
  implemented: boolean;
  credentialsReady: boolean;
  missingEnv: string[];
}

/** Server configuration only: never labels a channel connected or a post published. */
export function PublishConfiguration({
  platforms,
  simulated,
}: {
  platforms: readonly PublishingCapability[];
  simulated: boolean;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const implemented = platforms.filter((p) => p.implemented);
  const configured = implemented.filter((p) => p.credentialsReady);

  return (
    <section className="section-card space-y-3 p-4" aria-labelledby={headingId}>
      <h2 id={headingId} className="text-sm font-semibold">
        {t("scheduler.configurationTitle")}
      </h2>
      <p className="text-sm text-muted-foreground">
        {platforms.length === 0
          ? t("scheduler.configurationEmpty")
          : t("scheduler.configurationSummary", {
              count: configured.length,
              total: implemented.length,
            })}
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("scheduler.configurationScope")}
      </p>
      {simulated && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground"
        >
          <FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t("scheduler.simulatedWarning")}
        </p>
      )}
      {platforms.length > 0 && (
        <details className="rounded-lg border border-border/60 px-3">
          <summary className="min-h-11 cursor-pointer content-center py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {t("scheduler.configurationDetails")}
          </summary>
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            {t("scheduler.capabilityLabel")}
          </p>
          <ul className="space-y-3 pb-4">
            {platforms.map((p) => {
              const configured = p.implemented && p.credentialsReady;
              const Icon = !p.implemented ? XCircle : configured ? CheckCircle2 : AlertTriangle;
              return (
                <li key={p.platform} className="rounded-lg bg-background/50 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    <span className="font-medium">
                      {PLATFORM_RULES[p.platform as PlatformId]?.label ?? p.platform}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {!p.implemented
                        ? t("scheduler.notImplemented")
                        : configured
                          ? t("scheduler.configurationAvailable")
                          : t("scheduler.configurationPending")}
                    </span>
                  </div>
                  {p.implemented && !configured && p.missingEnv.length > 0 && (
                    <p className="mt-2 break-words text-xs text-muted-foreground">
                      {t("scheduler.missingEnvironment", { variables: p.missingEnv.join(", ") })}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
