import { useTranslation } from "react-i18next";

export function GoogleSignIn({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border border-border bg-card/40 px-4 py-3 text-sm font-semibold hover:bg-card disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path
            fill="#EA4335"
            d="M12 11v3.2h5.5c-.2 1.5-1.7 4.3-5.5 4.3-3.3 0-6-2.7-6-6.1S8.7 6.4 12 6.4c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.9 14.6 3 12 3 6.9 3 2.8 7.1 2.8 12S6.9 21 12 21c6.9 0 9.2-4.8 9.2-7.3 0-.5-.1-.9-.1-1.3H12z"
          />
        </svg>
        {t("common.continueWithGoogle")}
      </button>
      <div className="my-7 flex items-center gap-4 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        {t("common.or")}
        <div className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}
