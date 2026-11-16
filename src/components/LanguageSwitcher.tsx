import { useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { SUPPORTED_LANGUAGES, persistLanguagePreference, type LanguageCode } from "@/lib/i18n";

/** Native names in full mode; compact codes keep narrow headers usable. */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { i18n, t } = useTranslation();
  const router = useRouter();
  const current = (i18n.resolvedLanguage ?? i18n.language) as LanguageCode;

  return (
    <label
      className={`flex min-h-11 shrink-0 items-center rounded-md text-sm text-muted-foreground transition hover:bg-sidebar-accent/50 hover:text-sidebar-foreground ${
        compact ? "gap-1.5 px-1.5" : "gap-2.5 px-3 py-2"
      }`}
      title={t("common.language")}
    >
      <Languages aria-hidden="true" className="size-4 shrink-0" />
      <span className="sr-only">{t("common.language")}</span>
      <select
        value={current}
        onChange={async (e) => {
          const language = e.target.value as LanguageCode;
          persistLanguagePreference(language);
          await i18n.changeLanguage(language);
          await router.invalidate();
        }}
        className={`min-h-11 min-w-0 cursor-pointer rounded bg-transparent text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
          compact ? "w-[4.5rem]" : "flex-1"
        }`}
        aria-label={t("common.language")}
      >
        {SUPPORTED_LANGUAGES.map((l) => (
          <option
            key={l.code}
            value={l.code}
            aria-label={compact ? `${l.code.toUpperCase()} — ${l.native}` : undefined}
            className="bg-background text-foreground"
          >
            {compact ? l.code.toUpperCase() : `${l.flag} ${l.native}`}
          </option>
        ))}
      </select>
    </label>
  );
}
