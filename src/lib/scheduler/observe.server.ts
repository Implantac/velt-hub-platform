/**
 * Read-only provider observations. No create, upload, publish, delete or retry of
 * a write is allowed here. TikTok's status-fetch POST is a documented read.
 * Unknown/private/missing resources are never inferred to be public or absent.
 */
import { metaGraphBase } from "@/lib/oauth/meta-version.server";
import type { Platform } from "./contracts";
import type { PublicationReference } from "./references";
import { validPublicationReference } from "./references";
import { parseProviderJson } from "./provider-json.server";

export type PublicationObservation =
  | { state: "confirmed"; externalPostId: string; note: string }
  | { state: "pending" | "review" | "rejected"; note: string };

export interface ObservationInput {
  platform: Platform;
  target: string;
  reference: PublicationReference;
  accessToken: string;
}

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as ObjectValue) : {};
const pending = (note: string): PublicationObservation => ({ state: "pending", note });
const review = (note: string): PublicationObservation => ({ state: "review", note });
const rejected = (note: string): PublicationObservation => ({ state: "rejected", note });
const confirmed = (externalPostId: string, note: string): PublicationObservation => ({
  state: "confirmed",
  externalPostId,
  note,
});

class ObservationHttpError extends Error {
  constructor(readonly status: number) {
    super("Provider observation failed");
  }
}

async function readJson(url: string | URL, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...init.headers },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new ObservationHttpError(response.status);
  const text = await response.text();
  if (text.length > 512_000) throw new Error("Unexpectedly large provider response");
  return object(parseProviderJson(text));
}

async function observeGoogle(input: ObservationInput): Promise<PublicationObservation> {
  const post = await readJson(
    `https://mybusiness.googleapis.com/v4/${input.reference.id}`,
    input.accessToken,
  );
  if (post.name !== input.reference.id)
    return review("A consulta retornou outra referência/unidade do Google Business.");
  if (post.state === "LIVE" || post.state === "RECURRING")
    return confirmed(
      input.reference.id,
      "Google Business confirmou que o post aparece nos resultados de busca.",
    );
  if (post.state === "REJECTED") return rejected("O Google Business rejeitou este post.");
  if (post.state === "PROCESSING" || post.state === "SCHEDULED")
    return pending("O Google Business ainda está processando ou aguardando a publicação.");
  return review("O Google Business retornou um estado não reconhecido; revise antes de reenviar.");
}

async function observeTikTok(input: ObservationInput): Promise<PublicationObservation> {
  const result = await readJson(
    "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
    input.accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ publish_id: input.reference.id }),
    },
  );
  const error = object(result.error).code;
  if (error !== "ok") {
    if (error === "rate_limit_exceeded" || error === "internal_error")
      return pending(
        "TikTok temporariamente indisponível para consulta; nenhum envio foi repetido.",
      );
    return review(
      "TikTok não autorizou a consulta desta referência. Confira a conta e a autorização.",
    );
  }
  const data = object(result.data);
  if (data.status === "FAILED") return rejected("TikTok informou falha terminal neste envio.");
  if (data.status === "SEND_TO_USER_INBOX")
    return review(
      "O envio foi para a caixa de entrada do TikTok, não uma publicação pública confirmada.",
    );
  if (data.status === "PUBLISH_COMPLETE") {
    const ids = data.publicaly_available_post_id;
    if (Array.isArray(ids) && ids.length === 1) {
      const value = ids[0];
      const id =
        typeof value === "string" ? value : Number.isSafeInteger(value) ? String(value) : "";
      if (/^\d+$/.test(id))
        return confirmed(
          id,
          "TikTok retornou um único identificador de post publicamente disponível.",
        );
    }
    if (Array.isArray(ids) && ids.length > 1)
      return review(
        "TikTok retornou vários posts para esta referência; não é seguro escolher um automaticamente.",
      );
    return pending(
      "TikTok concluiu o envio, mas ainda não forneceu um identificador público (ex.: moderação).",
    );
  }
  if (data.status === "PROCESSING_UPLOAD" || data.status === "PROCESSING_DOWNLOAD")
    return pending("TikTok ainda está processando o mesmo envio; o upload não será repetido.");
  return review("TikTok retornou um estado não reconhecido; confira o provedor.");
}

async function observeYouTube(input: ObservationInput): Promise<PublicationObservation> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,status,processingDetails");
  url.searchParams.set("id", input.reference.id);
  const data = await readJson(url, input.accessToken);
  if (!Array.isArray(data.items) || data.items.length !== 1)
    return review(
      "YouTube não retornou o vídeo exato. Ausência na consulta não comprova que nunca foi publicado.",
    );
  const video = object(data.items[0]);
  if (video.id !== input.reference.id || object(video.snippet).channelId !== input.target)
    return review("O vídeo consultado não corresponde ao canal e à referência preservados.");
  const status = object(video.status);
  const processing = object(video.processingDetails).processingStatus;
  if (
    ["failed", "rejected", "deleted"].includes(String(status.uploadStatus)) ||
    ["failed", "terminated"].includes(String(processing))
  )
    return rejected("YouTube informou falha/rejeição terminal no vídeo consultado.");
  if (status.uploadStatus === "uploaded" || processing === "processing")
    return pending("YouTube recebeu o upload e ainda está processando o vídeo.");
  if (status.privacyStatus !== "public")
    return review(
      "YouTube não confirmou visibilidade pública. Projetos não auditados podem restringir uploads a privados.",
    );
  if (
    status.uploadStatus === "processed" &&
    (processing === undefined || processing === "succeeded")
  )
    return confirmed(
      input.reference.id,
      "YouTube confirmou vídeo processado e público no canal esperado.",
    );
  return review("YouTube não retornou um estado de processamento público reconhecido.");
}

async function observeLinkedIn(input: ObservationInput): Promise<PublicationObservation> {
  const post = await readJson(
    `https://api.linkedin.com/rest/posts/${encodeURIComponent(input.reference.id)}`,
    input.accessToken,
    { headers: { "LinkedIn-Version": "202601", "X-Restli-Protocol-Version": "2.0.0" } },
  );
  if (post.id !== input.reference.id || post.author !== input.target)
    return review("O post do LinkedIn não corresponde à referência e ao autor esperados.");
  if (post.lifecycleState === "PROCESSING" || post.lifecycleState === "PUBLISH_REQUESTED")
    return pending("LinkedIn ainda não confirmou o estado final do post.");
  if (post.lifecycleState === "PROCESSING_FAILED")
    return rejected("LinkedIn informou falha no processamento do post.");
  if (
    post.lifecycleState === "PUBLISHED" &&
    post.visibility === "PUBLIC" &&
    object(post.distribution).feedDistribution === "MAIN_FEED"
  )
    return confirmed(
      input.reference.id,
      "LinkedIn confirmou post público no feed do autor esperado.",
    );
  return review(
    "LinkedIn não confirmou um post público no feed. A leitura também exige permissões próprias do provedor.",
  );
}

async function observeMeta(input: ObservationInput): Promise<PublicationObservation> {
  const kind = input.reference.kind;
  // A photo resource alone is not a Page post. There is no safe guessed mapping.
  if (kind === "facebook_photo")
    return review(
      "Apenas o ID da foto foi preservado; falta o ID do post da Página. Não inferir publicação a partir do upload.",
    );
  const fields =
    kind === "instagram_container"
      ? "id,status_code"
      : kind === "instagram_media"
        ? "id,owner,permalink"
        : kind === "facebook_video"
          ? "id,from,status,published"
          : "id,from,is_published,is_hidden,is_expired";
  const url = new URL(`${metaGraphBase()}/${input.reference.id}`);
  url.searchParams.set("fields", fields);
  const media = await readJson(url, input.accessToken);
  if (media.id !== input.reference.id) return review("Meta retornou outra referência de recurso.");
  if (kind === "instagram_container") {
    if (media.status_code === "ERROR" || media.status_code === "EXPIRED")
      return rejected("O container do Instagram falhou ou expirou sem publicação confirmada.");
    if (media.status_code === "IN_PROGRESS")
      return pending("Instagram ainda processa o container preservado.");
    if (media.status_code === "PUBLISHED")
      return review(
        "Instagram indica container publicado, mas não forneceu o ID da mídia. Não reenviar nem usar container como post.",
      );
    return review(
      "O container do Instagram não é uma mídia publicada confirmada. Esta consulta nunca chama media_publish.",
    );
  }
  if (kind === "instagram_media") {
    if (
      object(media.owner).id === input.target &&
      typeof media.permalink === "string" &&
      /^https:\/\/(?:www\.)?instagram\.com\//.test(media.permalink)
    )
      return confirmed(
        input.reference.id,
        "Instagram confirmou a mídia e o proprietário esperados.",
      );
    return review("Instagram não confirmou o proprietário/permalink da mídia preservada.");
  }
  if (object(media.from).id !== input.target)
    return review("Meta não confirmou a Página autora deste recurso.");
  if (kind === "facebook_post") {
    if (media.is_published === true && media.is_hidden === false && media.is_expired === false)
      return confirmed(
        input.reference.id,
        "Facebook confirmou post publicado e não oculto na Página esperada.",
      );
    return review("Facebook não confirmou que o post da Página está publicado e não oculto.");
  }
  const status = object(media.status);
  const publishing = object(status.publishing_phase);
  if (
    ["error", "expired", "upload_failed"].includes(String(status.video_status)) ||
    publishing.status === "error"
  )
    return rejected("Facebook informou falha terminal no processamento/publicação do vídeo.");
  if (
    status.video_status === "ready" &&
    media.published === true &&
    publishing.publish_status === "published"
  )
    return confirmed(
      input.reference.id,
      "Facebook confirmou o vídeo processado e publicado na Página esperada.",
    );
  if (
    ["uploading", "upload_complete", "processing"].includes(String(status.video_status)) ||
    publishing.status === "in_progress"
  )
    return pending("Facebook ainda está processando/publicando o mesmo vídeo.");
  return review(
    "Facebook não confirmou um vídeo publicado; estar pronto para publicar não é estar publicado.",
  );
}

export async function observePublication(input: ObservationInput): Promise<PublicationObservation> {
  if (
    !input.accessToken?.trim() ||
    !validPublicationReference(input.platform, input.target, input.reference)
  )
    return review(
      "Não há autorização/referência válida para uma consulta segura. Nenhum provedor foi chamado.",
    );
  try {
    switch (input.platform) {
      case "google_business":
        return await observeGoogle(input);
      case "tiktok":
        return await observeTikTok(input);
      case "youtube":
        return await observeYouTube(input);
      case "linkedin":
        return await observeLinkedIn(input);
      case "instagram":
      case "facebook":
        return await observeMeta(input);
      default:
        return review("Consulta automática não implementada para esta plataforma.");
    }
  } catch (error) {
    if (error instanceof ObservationHttpError && [401, 403].includes(error.status))
      return review(
        "O provedor recusou a autorização de leitura. Reconecte a mesma conta ou revise as permissões; não reenviar.",
      );
    if (
      error instanceof ObservationHttpError &&
      error.status >= 400 &&
      error.status < 500 &&
      error.status !== 429
    )
      return review(
        "O provedor não confirmou esta referência. Um erro de leitura não prova ausência da publicação.",
      );
    // Do not persist arbitrary upstream text, request URLs or access tokens.
    return pending(
      "Não foi possível concluir a consulta do provedor. Nova consulta terá backoff; nenhum envio foi repetido.",
    );
  }
}
