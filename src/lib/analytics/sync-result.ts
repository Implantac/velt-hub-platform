/** Serializable analytics results; safe to share with the UI without server imports. */
export type SyncIssueCode =
  | "publication_read_failed"
  | "authorization_unavailable"
  | "rate_limited"
  | "provider_unauthorized"
  | "authorization_record_failed"
  | "collection_failed"
  | "invalid_metrics"
  | "additional_metrics_unavailable"
  | "persistence_unconfirmed"
  | "authorization_changed"
  | "publication_changed";

export type SyncSkipCode = "unsupported" | "no_publications" | "unavailable";

export interface SyncSummary {
  channelsConsidered: number;
  /** Channels with at least one acknowledged observation, not necessarily complete. */
  channelsSynced: number;
  /** Valid, distinct post observations read from a provider, even if saving failed. */
  postsMeasured: number;
  /** Publications for which the provider returned no observation. Never saved as zero. */
  postsUnavailable: number;
  /** Acknowledged atomic commits (inserts or same-day updates), not new row count. */
  snapshotsWritten: number;
  skipped: Array<{ channelId: string; platform: string; code: SyncSkipCode; reason: string }>;
  errors: Array<{
    channelId: string;
    platform: string;
    code: SyncIssueCode;
    error: string;
    /** Failures of the same kind are grouped within each channel. */
    count: number;
  }>;
  durationMs: number;
}

/** A saved subset must never take the all-success toast path. */
export function syncOutcome(
  result: Pick<SyncSummary, "snapshotsWritten" | "errors" | "postsUnavailable" | "skipped">,
): "success" | "partial" | "error" | "empty" {
  if (result.snapshotsWritten > 0) {
    const incomplete =
      result.errors.length > 0 ||
      result.postsUnavailable > 0 ||
      result.skipped.some((skip) => skip.code !== "no_publications");
    return incomplete ? "partial" : "success";
  }
  return result.errors.length > 0 ? "error" : "empty";
}

/** PostgREST returning HTTP 200 without a valid transaction receipt is not a save. */
export function hasObservationReceipt(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  return (
    receipt.accepted === true &&
    typeof receipt.snapshot_id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      receipt.snapshot_id,
    ) &&
    typeof receipt.captured_at === "string" &&
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      receipt.captured_at,
    ) &&
    Number.isFinite(Date.parse(receipt.captured_at)) &&
    // Date.parse normalizes impossible calendar dates such as February 30.
    new Date(receipt.captured_at.slice(0, 10) + "T00:00:00Z").toISOString().slice(0, 10) ===
      receipt.captured_at.slice(0, 10)
  );
}
