import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Brain } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export const authInputClass =
  "w-full rounded-xl border border-border bg-background/50 px-4 py-3 text-sm transition-all focus:border-primary/50 focus:outline-none focus:ring-4 focus:ring-primary/10 placeholder:text-muted-foreground/60 disabled:opacity-60";
export const authPrimaryClass =
  "w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-glow transition-all hover:opacity-95 disabled:opacity-50";
export const authSecondaryClass =
  "inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border px-4 py-3 text-center text-sm font-semibold hover:bg-secondary disabled:opacity-50";

export function AuthFrame({
  headingId,
  title,
  subtitle,
  children,
}: {
  headingId: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main
      aria-labelledby={headingId}
      className="relative grid min-h-screen place-items-center px-4 py-12"
    >
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,oklch(0.72_0.2_285_/_0.15),transparent_50%)]" />
      <div className="w-full min-w-0 max-w-md card-premium p-6 sm:p-10 animate-rise-in">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link to="/" className="group flex items-center gap-2.5">
            <div className="grid size-10 place-items-center rounded-xl bg-gradient-brand shadow-glow">
              <Brain className="size-5 text-primary-foreground" aria-hidden="true" />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground">VELT</span>
          </Link>
          <LanguageSwitcher compact />
        </div>
        <div className="mb-8 space-y-2">
          <h1
            id={headingId}
            className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
          >
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
