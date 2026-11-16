/** YouTube resumable upload. Session acceptance and a video ID are not public visibility. */
import { composeCaption, detectMediaKind, isFetchableUrl } from "../media";
import { downloadPublicMedia } from "../media-download.server";
import { PublisherError, type PublishInput, type PublishResult } from "../contracts";
import { beforeProviderWrite, preservePublicationReference } from "../references";
import { confirmPublication } from "./confirmation.server";

const UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/youtube/v3/videos";
const MAX_UPLOAD_BYTES = 128 * 1024 * 1024;

function accessTokenFor(input: PublishInput): string {
  const token = input.channelConfig.access_token ?? input.channelConfig.accessToken;
  if (typeof token !== "string" || !token.trim())
    throw new PublisherError(
      "Canal do YouTube sem access_token — reconecte o canal antes de publicar.",
    );
  return token;
}

export async function publishYouTube(input: PublishInput): Promise<PublishResult> {
  const token = accessTokenFor(input);
  const videoUrl = (input.payload.media_urls ?? []).find(
    (url) => isFetchableUrl(url) && detectMediaKind(url) === "video",
  );
  if (!videoUrl)
    throw new PublisherError("YouTube exige um arquivo de vídeo público (.mp4/.mov) em HTTPS.");

  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await downloadPublicMedia(videoUrl, { maxBytes: MAX_UPLOAD_BYTES });
  } catch (error) {
    const failure = error as { message?: string; retryable?: boolean };
    throw new PublisherError(failure.message ?? "Falha ao baixar o vídeo.", {
      retryable: failure.retryable ?? false,
    });
  }

  const startUrl = new URL(UPLOAD_ENDPOINT);
  startUrl.searchParams.set("uploadType", "resumable");
  startUrl.searchParams.set("part", "snippet,status");
  await beforeProviderWrite(input);
  const start = await fetch(startUrl, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(bytes.byteLength),
      "X-Upload-Content-Type": "video/*",
    },
    body: JSON.stringify({
      snippet: {
        title: (input.payload.title ?? "").trim(),
        description: composeCaption(null, input.payload.body),
        categoryId: "22",
      },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    }),
  });
  if (!start.ok)
    throw new PublisherError(`YouTube recusou a criação da sessão de upload (${start.status}).`, {
      // No video bytes have been sent in this two-phase protocol.
      retryable: start.status >= 500 || start.status === 429,
      definiteRejection: true,
    });

  // Never persist the resumable URI: it can itself carry upload authority.
  const location = start.headers.get("location");
  if (!location) throw new PublisherError("YouTube não retornou uma URI de upload válida.");
  const uploadUri = new URL(location);
  if (
    uploadUri.protocol !== "https:" ||
    uploadUri.hostname !== "www.googleapis.com" ||
    uploadUri.pathname !== "/upload/youtube/v3/videos" ||
    uploadUri.port ||
    uploadUri.username ||
    uploadUri.password
  )
    throw new PublisherError("YouTube retornou um destino de upload não reconhecido.");

  await beforeProviderWrite(input);
  const upload = await fetch(uploadUri, {
    method: "PUT",
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
    headers: { "Content-Type": "video/*", "Content-Length": String(bytes.byteLength) },
    body: bytes,
  });
  let json: { id?: string };
  try {
    json = (await upload.json()) as { id?: string };
  } catch {
    throw new PublisherError(
      "YouTube não retornou uma confirmação válida do upload. Confira o canal antes de reenviar.",
    );
  }
  if (!upload.ok || typeof json?.id !== "string")
    throw new PublisherError(
      `YouTube não confirmou o upload (${upload.status}). Confira o canal antes de reenviar.`,
    );
  const reference = { kind: "youtube_video" as const, id: json.id };
  await preservePublicationReference(input, reference);
  // Pending/private/unaudited videos are reconciled by reading this exact ID, never re-uploaded.
  return confirmPublication(input, reference, token);
}
