/**
 * TikTok Direct Post. An uploaded draft or a publish_id is NOT a confirmed public post.
 * Status contract: https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status
 * External app approval and creator consent still require provider homologation.
 */
import { composeCaption, detectMediaKind, isFetchableUrl } from "../media";
import { downloadPublicMedia } from "../media-download.server";
import { PublisherError, type PublishInput, type PublishResult } from "../contracts";
import { beforeProviderWrite, preservePublicationReference } from "../references";
import { parseProviderJson } from "../provider-json.server";
import { confirmPublication } from "./confirmation.server";

const TIKTOK_API = "https://open.tiktokapis.com/v2";
const MAX_BYTES = 64 * 1024 * 1024; // Single-chunk upload; do not silently exceed the API chunk limit.

type TikTokResponse = {
  data?: {
    privacy_level_options?: string[];
    comment_disabled?: boolean;
    duet_disabled?: boolean;
    stitch_disabled?: boolean;
    publish_id?: string;
    upload_url?: string;
    status?: string;
    fail_reason?: string;
    publicaly_available_post_id?: Array<string | number>;
  };
  error?: { code?: string };
};

function parseResponse(text: string): TikTokResponse {
  return parseProviderJson(text) as TikTokResponse;
}

async function api(
  path: string,
  token: string,
  body: Record<string, unknown>,
): Promise<TikTokResponse> {
  const res = await fetch(`${TIKTOK_API}/${path}`, {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  let json: TikTokResponse;
  try {
    json = parseResponse(await res.text());
  } catch {
    throw new PublisherError(
      "TikTok retornou uma resposta inválida. Confira o provedor antes de repetir.",
      {
        retryable: false,
      },
    );
  }
  if (!res.ok || json.error?.code !== "ok") {
    throw new PublisherError(
      `TikTok recusou a operação (${res.status}). Confira a autorização do aplicativo.`,
      {
        retryable: res.status === 429,
        definiteRejection: [400, 401, 403, 429].includes(res.status),
      },
    );
  }
  return json;
}

export async function publishTikTok(input: PublishInput): Promise<PublishResult> {
  const configuredMode = input.channelConfig.posting_mode;
  if (process.env.TIKTOK_DIRECT_POST !== "true" || configuredMode === "inbox") {
    throw new PublisherError(
      "TikTok exige Direct Post aprovado e TIKTOK_DIRECT_POST=true. Enviar um rascunho para a caixa de entrada não é publicar.",
      { retryable: false },
    );
  }
  const token = input.channelConfig.access_token;
  if (typeof token !== "string" || !token.trim()) {
    throw new PublisherError("Canal do TikTok sem access_token — reconecte o canal.", {
      retryable: false,
    });
  }
  const urls = input.payload.media_urls ?? [];
  if (urls.length !== 1 || !isFetchableUrl(urls[0]) || detectMediaKind(urls[0]) !== "video") {
    throw new PublisherError(
      "TikTok aceita um vídeo (.mp4/.mov) público em HTTPS por publicação.",
      { retryable: false },
    );
  }

  // The creator's allowed visibility must be checked before every Direct Post.
  const creator = await api("post/publish/creator_info/query/", token, {});
  if (!creator.data?.privacy_level_options?.includes("PUBLIC_TO_EVERYONE")) {
    throw new PublisherError(
      "TikTok não autorizou visibilidade pública para este criador/aplicativo.",
      { retryable: false },
    );
  }
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await downloadPublicMedia(urls[0], { maxBytes: MAX_BYTES });
  } catch (error) {
    const failure = error as { message?: string; retryable?: boolean };
    throw new PublisherError(failure.message ?? "Falha ao baixar o vídeo.", {
      retryable: failure.retryable ?? false,
    });
  }

  await beforeProviderWrite(input);
  const initialized = await api("post/publish/video/init/", token, {
    post_info: {
      title: composeCaption(input.payload.title, input.payload.body),
      privacy_level: "PUBLIC_TO_EVERYONE",
      disable_duet: creator.data.duet_disabled === true,
      disable_comment: creator.data.comment_disabled === true,
      disable_stitch: creator.data.stitch_disabled === true,
    },
    source_info: {
      source: "FILE_UPLOAD",
      video_size: bytes.byteLength,
      chunk_size: bytes.byteLength,
      total_chunk_count: 1,
    },
  });
  const reference = initialized.data?.publish_id;
  const uploadUrl = initialized.data?.upload_url;
  const checkpoint = reference ? { kind: "tiktok_publish" as const, id: reference } : undefined;
  if (checkpoint) await preservePublicationReference(input, checkpoint);
  if (!reference || !uploadUrl) {
    throw new PublisherError(
      "TikTok não retornou publish_id/upload_url. Verifique antes de repetir.",
      { retryable: false, reference: checkpoint },
    );
  }

  try {
    const target = new URL(uploadUrl);
    if (
      target.protocol !== "https:" ||
      !target.hostname.endsWith(".tiktokapis.com") ||
      target.username ||
      target.password ||
      target.port
    ) {
      throw new Error("Unexpected upload host");
    }
    await beforeProviderWrite(input);
    const uploaded = await fetch(target, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
      },
      body: bytes,
      redirect: "error",
      signal: AbortSignal.timeout(120_000),
    });
    if (!uploaded.ok) throw new Error("Upload has no confirmed acknowledgement");

    // One read only. Processing/moderation continues through durable
    // reconciliation, not a long in-request polling loop or a new upload.
    const result = await confirmPublication(input, checkpoint!, token);
    return { ...result, raw: { publish_id: reference, mode: "direct", bytes: bytes.byteLength } };
  } catch {
    throw new PublisherError(
      "TikTok recebeu uma referência de envio, mas a publicação pública não foi confirmada. Confira o provedor antes de republicar.",
      { retryable: false, reference: checkpoint },
    );
  }
}
