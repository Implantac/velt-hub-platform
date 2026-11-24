import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { SkillSnapshot } from "@/lib/skill-map/contracts";

export function SkillMapReadState({
  headingAs: Heading = "h2",
  data,
  isError,
  isFetching,
  busy,
  onRead,
  children,
}: {
  headingAs?: "h2" | "h3";
  data: SkillSnapshot | undefined;
  isError: boolean;
  isFetching: boolean;
  busy: boolean;
  onRead: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const retry = (
    <button
      type="button"
      onClick={onRead}
      disabled={isFetching || busy}
      className="min-h-11 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
    >
      {t("skillMapNative.refresh")}
    </button>
  );
  if (data === undefined)
    return isError ? (
      <section role="alert" className="space-y-3 rounded-xl border border-border p-4">
        <Heading className="font-semibold">{t("skillMapNative.readError")}</Heading>
        <p className="text-sm text-muted-foreground">{t("skillMapNative.readErrorHint")}</p>
        {retry}
      </section>
    ) : (
      <p role="status" className="rounded-xl border border-border p-4 text-sm">
        {t("skillMapNative.loading")}
      </p>
    );
  return (
    <div className="min-w-0 space-y-4">
      {isError && (
        <section role="alert" className="space-y-3 rounded-xl border border-border p-4">
          <Heading className="font-semibold">{t("skillMapNative.stale")}</Heading>
          <p className="text-sm text-muted-foreground">{t("skillMapNative.staleHint")}</p>
          {retry}
        </section>
      )}
      {isFetching && (
        <p role="status" className="text-sm">
          {t("skillMapNative.reading")}
        </p>
      )}
      {data.total === 0 && (
        <p className="rounded-xl border border-border p-4 text-sm leading-relaxed">
          {t("skillMapNative.empty")}
        </p>
      )}
      {children}
    </div>
  );
}
