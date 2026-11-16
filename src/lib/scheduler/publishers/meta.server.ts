/**
 * VELT — Meta Graph publishers (Facebook Page + Instagram Business).
 *
 * Instagram publishing is a three-step, asynchronous protocol. Almost every
 * "publishing is broken" bug in this category comes from treating it as a single
 * call:
 *
 *   1. POST /{ig-user-id}/media        -> returns a creation_id (container)
 *   2. GET  /{creation_id}?fields=status_code  -> poll until FINISHED
 *   3. POST /{ig-user-id}/media_publish -> publishes the container
 *
 * Step 2 is mandatory for video: Meta downloads and transcodes the asset, which
 * takes seconds to minutes. Publishing a container that is still IN_PROGRESS
 * returns an error that looks unrelated. Facebook Pages, by contrast, publish
 * synchronously — one call with the photo or feed edge.
 *
 * Both paths require a Page/IG access token, which is NOT the user token:
 * the user token is resolved to the selected Page token during connection.
 * The dispatcher injects the decrypted token privately; it never falls back after an OAuth failure.
 */

import { metaGraphBase } from "@/lib/oauth/meta-version.server";
import { composeCaption, detectMediaKind, isFetchableUrl, pickPrimaryMedia } from "../media";
import { PublisherError, type PublishInput, type PublishResult } from "../contracts";
import {
  beforeProviderWrite,
  preservePublicationReference,
  publicationTarget,
} from "../references";
import { confirmPublication } from "./confirmation.server";

export class MetaError extends PublisherError {
  readonly code?: number;
  constructor(
    message: string,
    opts: { retryable?: boolean; code?: number; definiteRejection?: boolean } = {},
  ) {
    super(message, opts);
    this.name = "MetaError";
    this.code = opts.code;
  }
}

/** Polling budget for the Instagram container. */
const CONTAINER_POLL_TIMEOUT_MS = 120_000;
const CONTAINER_POLL_INTERVAL_MS = 4_000;

interface GraphError {
  error?: { message?: string; code?: number; error_subcode?: number; is_transient?: boolean };
}

async function graphFetch<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string> } = {},
): Promise<T> {
  const url = new URL(`${metaGraphBase()}/${path.replace(/^\//, "")}`);
  const { query = {}, ...requestInit } = init;
  for (const [key, value] of Object.entries(query))
    if (key !== "access_token") url.searchParams.set(key, value);
  const res = await fetch(url, {
    ...requestInit,
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: {
      ...requestInit.headers,
      ...(query.access_token ? { Authorization: `Bearer ${query.access_token}` } : {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body: fall through with the raw text */
  }

  if (!res.ok) {
    const err = (json as GraphError)?.error;
    const msg = err?.message ?? text.slice(0, 300);
    // 190 = invalid/expired token (not retryable), 4/17 = rate limit (retryable)
    const retryable =
      res.status < 500 &&
      (err?.is_transient === true || err?.code === 4 || err?.code === 17 || res.status === 429);
    throw new MetaError(`Meta ${res.status}: ${msg}`, {
      retryable,
      code: err?.code,
      definiteRejection: [400, 401, 403, 429].includes(res.status),
    });
  }
  return json as T;
}

/** Resolves the page/IG token from channel metadata, with a clear failure. */
function resolvePageToken(channelConfig: Record<string, unknown>): string {
  const token =
    (channelConfig.access_token as string | undefined) ??
    (channelConfig.page_access_token as string | undefined) ??
    (channelConfig.pageAccessToken as string | undefined);
  if (!token) {
    throw new MetaError(
      "Canal sem page_access_token. Reconecte o canal pela tela de Canais para autorizar a Página e o Instagram.",
      { retryable: false },
    );
  }
  return token;
}

/* ------------------------------------------------------------------ */
/* Instagram                                                           */
/* ------------------------------------------------------------------ */

async function pollContainer(containerId: string, token: string): Promise<void> {
  const deadline = Date.now() + CONTAINER_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const status = await graphFetch<{ status_code?: string; status?: string }>(containerId, {
      query: { fields: "status_code,status", access_token: token },
    });

    if (status.status_code === "FINISHED") return;

    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new MetaError(
        `Container do Instagram terminou com ${status.status_code}: ${status.status ?? "sem detalhe"}. ` +
          "Normalmente indica mídia inacessível, formato inválido ou proporção fora do aceito.",
        { retryable: false },
      );
    }
    if (status.status_code === "PUBLISHED")
      throw new MetaError("Container já publicado; não repetir media_publish sem o ID da mídia.");
    // IN_PROGRESS: keep waiting
    await new Promise((r) => setTimeout(r, CONTAINER_POLL_INTERVAL_MS));
  }

  throw new MetaError(
    `Instagram não finalizou o processamento da mídia em ${CONTAINER_POLL_TIMEOUT_MS / 1000}s.`,
    { retryable: true },
  );
}

export async function publishInstagram(input: PublishInput): Promise<PublishResult> {
  const token = resolvePageToken(input.channelConfig);
  const igUserId = publicationTarget("instagram", input.channelConfig);
  const caption = composeCaption(input.payload.title, input.payload.body);
  const mediaUrls = (input.payload.media_urls ?? []).filter(isFetchableUrl);
  const primary = pickPrimaryMedia(mediaUrls);

  if (!primary) {
    throw new MetaError("Instagram exige mídia. Anexe uma imagem ou vídeo público em HTTPS.", {
      retryable: false,
    });
  }

  const isVideo = primary.kind === "video" || primary.kind === "unknown";

  // Step 1 — create the container.
  const containerParams: Record<string, string> = {
    access_token: token,
    caption,
  };
  if (isVideo) {
    containerParams.media_type = "REELS";
    containerParams.video_url = primary.url;
  } else {
    containerParams.image_url = primary.url;
  }

  await beforeProviderWrite(input);
  const created = await graphFetch<{ id: string }>(`${igUserId}/media`, {
    method: "POST",
    query: containerParams,
  });
  if (!created?.id)
    throw new MetaError("Instagram não retornou creation_id.", { retryable: false });
  const container = { kind: "instagram_container" as const, id: created.id };
  await preservePublicationReference(input, container);
  try {
    await pollContainer(created.id, token);
    await beforeProviderWrite(input);
    const published = await graphFetch<{ id: string }>(`${igUserId}/media_publish`, {
      method: "POST",
      query: { creation_id: created.id, access_token: token },
    });
    if (!published?.id) throw new MetaError("Instagram não retornou o ID da mídia publicada.");
    const media = { kind: "instagram_media" as const, id: published.id };
    await preservePublicationReference(input, media);
    return await confirmPublication(input, media, token);
  } catch (error) {
    if (error instanceof PublisherError && error.reference) throw error;
    throw new PublisherError(
      error instanceof Error ? error.message : "Instagram não confirmou a publicação.",
      { reference: container },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Facebook Page                                                       */
/* ------------------------------------------------------------------ */

export async function publishFacebook(input: PublishInput): Promise<PublishResult> {
  const token = resolvePageToken(input.channelConfig);
  const pageId = publicationTarget("facebook", input.channelConfig);

  const message = composeCaption(input.payload.title, input.payload.body);
  const mediaUrls = (input.payload.media_urls ?? []).filter(isFetchableUrl);
  const primary = pickPrimaryMedia(mediaUrls);

  // Photo posts carry the caption in the `caption` field, not `message`.
  if (primary && primary.kind === "image") {
    await beforeProviderWrite(input);
    const photo = await graphFetch<{ id: string; post_id?: string }>(`${pageId}/photos`, {
      method: "POST",
      query: { url: primary.url, caption: message, access_token: token },
    });
    if (photo?.post_id) {
      const reference = { kind: "facebook_post" as const, id: photo.post_id };
      await preservePublicationReference(input, reference);
      return confirmPublication(input, reference, token);
    }
    if (photo?.id) {
      const reference = { kind: "facebook_photo" as const, id: photo.id };
      await preservePublicationReference(input, reference);
      throw new PublisherError(
        "Facebook retornou apenas o ID da foto, sem confirmar o post da Página.",
        { reference },
      );
    }
    throw new PublisherError(
      "Facebook não retornou a referência da foto/post. Confira a Página antes de repetir.",
    );
  }

  if (primary && primary.kind === "video") {
    // Feed videos are uploaded by URL; Meta fetches asynchronously.
    await beforeProviderWrite(input);
    const video = await graphFetch<{ id: string }>(`${pageId}/videos`, {
      method: "POST",
      query: { file_url: primary.url, description: message, access_token: token },
    });
    const reference = { kind: "facebook_video" as const, id: video?.id };
    await preservePublicationReference(input, reference);
    return confirmPublication(input, reference, token);
  }

  await beforeProviderWrite(input);
  const post = await graphFetch<{ id: string }>(`${pageId}/feed`, {
    method: "POST",
    query: { message, access_token: token },
  });
  const reference = { kind: "facebook_post" as const, id: post?.id };
  await preservePublicationReference(input, reference);
  return confirmPublication(input, reference, token);
}

/** Utility used by tests and by the preflight panel's format hints. */
export const __metaInternals = { resolvePageToken, detectMediaKind };
