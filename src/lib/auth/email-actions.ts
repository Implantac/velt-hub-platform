export const EMAIL_RETRY_DELAY_MS = 60_000;

/** UI pacing only; actual rate limiting must also be configured in Supabase Auth. */
export function emailRetrySeconds(deadline: number, now: number): number {
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) return 0;
  return Math.min(60, Math.max(0, Math.ceil((deadline - now) / 1000)));
}

export function savedEmailDeadline(value: string | null, now: number): number {
  if (!value) return 0;
  const deadline = Number(value);
  return Number.isFinite(deadline) && deadline > now
    ? Math.min(deadline, now + EMAIL_RETRY_DELAY_MS)
    : 0;
}

/** Never take the post-email origin from search params or an untrusted return URL. */
export function authEmailRedirect(origin: string, kind: "signup" | "recovery"): string {
  const base = new URL(origin);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) {
    throw new Error("Invalid authentication origin");
  }
  return new URL(kind === "signup" ? "/app" : "/login?mode=reset", base.origin).href;
}
