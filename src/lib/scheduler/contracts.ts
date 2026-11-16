/**
 * VELT — Publishing contracts.
 *
 * Extracted from `publishers.server.ts` so provider implementations can import
 * the types without creating a circular dependency with the registry that
 * imports them.
 */

import type { PlatformId } from "@/lib/growth/platform-rules";
import type { PublicationReference } from "./references";

/** Every platform the dispatcher knows how to route. */
export type Platform = PlatformId;

export interface PublishInput {
  jobId: string;
  workspaceId: string;
  channelId: string;
  contentId: string;
  platform: Platform;
  payload: {
    title?: string | null;
    body?: string | null;
    media_urls?: string[];
    [k: string]: unknown;
  };
  channelConfig: Record<string, unknown>;
  /** Fenced database boundary, awaited immediately before any upstream write. */
  beforeWrite?: () => Promise<void>;
  /** Durable non-secret reference, awaited before further provider operations. */
  checkpoint?: (reference: PublicationReference) => Promise<void>;
}

export interface PublishResult {
  externalPostId: string;
  raw?: Record<string, unknown>;
}

/**
 * Error type carried through the retry/DLQ pipeline.
 * `retryable: false` sends the job straight to the dead letter queue instead of
 * burning the remaining attempts on something that cannot succeed.
 */
export class PublisherError extends Error {
  readonly retryable: boolean;
  /** Legacy alias for an upstream reference; never treat this alone as public success. */
  readonly externalPostId?: string;
  readonly reference?: PublicationReference;
  /** Only an explicit upstream refusal can make a started, reference-free write safe to retry. */
  readonly definiteRejection: boolean;
  constructor(
    message: string,
    opts: {
      retryable?: boolean;
      externalPostId?: string;
      reference?: PublicationReference;
      definiteRejection?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "PublisherError";
    this.retryable = opts.retryable ?? false;
    this.reference = opts.reference;
    this.externalPostId = opts.reference?.id ?? opts.externalPostId;
    this.definiteRejection = opts.definiteRejection ?? false;
  }
}
