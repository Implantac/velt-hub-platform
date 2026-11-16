/**
 * VELT — LinkedIn publisher (Posts API, versioned endpoints).
 *
 * LinkedIn's versioned API uses `LinkedIn-Version: YYYYMM`. Pinning the version
 * is mandatory: unversioned calls now return 426. We pin to a dated version and
 * keep it in one constant so upgrading is a one-line change.
 *
 * Two author shapes exist. Personal profiles upload a binary image via
 * `initializeUpload` and then reference the returned URN; organisations post as
 * the page. Both are supported because a small business usually has one of each.
 */

import { composeCaption, detectMediaKind, isFetchableUrl } from "../media";
import { downloadPublicMedia } from "../media-download.server";
import { PublisherError } from "../contracts";
import type { PublishInput, PublishResult } from "../contracts";
import {
  beforeProviderWrite,
  preservePublicationReference,
  publicationTarget,
} from "../references";
import { confirmPublication } from "./confirmation.server";

const LINKEDIN_API = "https://api.linkedin.com/rest";
/** Bump deliberately: LinkedIn retires versions roughly yearly. */
const LINKEDIN_VERSION = "202601";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function token(input: PublishInput): string {
  const t =
    (input.channelConfig.access_token as string | undefined) ??
    (input.channelConfig.accessToken as string | undefined);
  if (!t) {
    throw new PublisherError("Canal do LinkedIn sem access_token — reconecte o canal.", {
      retryable: false,
    });
  }
  return t;
}

/** Author URN: organisation when present, otherwise the person. */
function authorUrn(input: PublishInput): string {
  return publicationTarget("linkedin", input.channelConfig);
}

const headers = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
  "LinkedIn-Version": LINKEDIN_VERSION,
  "X-Restli-Protocol-Version": "2.0.0",
});

/** Uploads an image and returns its image URN. */
async function uploadImage(
  input: PublishInput,
  accessToken: string,
  owner: string,
  imageUrl: string,
): Promise<string> {
  await beforeProviderWrite(input);
  const init = await fetch(`${LINKEDIN_API}/images?action=initializeUpload`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: headers(accessToken),
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });

  const initText = await init.text();
  if (!init.ok) {
    throw new PublisherError(
      `LinkedIn recusou o upload da imagem (${init.status}): ${initText.slice(0, 300)}`,
      { retryable: init.status >= 500 },
    );
  }
  const initJson = JSON.parse(initText) as {
    value?: { uploadUrl?: string; image?: string };
  };
  const uploadUrl = initJson.value?.uploadUrl;
  const imageUrn = initJson.value?.image;
  if (!uploadUrl || !imageUrn) {
    throw new PublisherError("LinkedIn não retornou uploadUrl/image URN.", { retryable: true });
  }

  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = await downloadPublicMedia(imageUrl, { maxBytes: MAX_IMAGE_BYTES });
  } catch (error) {
    const failure = error as { message?: string; retryable?: boolean };
    throw new PublisherError(failure.message ?? "Falha ao baixar a imagem.", {
      retryable: failure.retryable ?? true,
    });
  }

  const uploadTarget = new URL(uploadUrl);
  if (
    uploadTarget.protocol !== "https:" ||
    !uploadTarget.hostname.endsWith(".linkedin.com") ||
    uploadTarget.username ||
    uploadTarget.password ||
    uploadTarget.port
  )
    throw new PublisherError("LinkedIn retornou um destino de upload não reconhecido.");
  await beforeProviderWrite(input);
  const put = await fetch(uploadTarget, {
    method: "PUT",
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
    },
    body: bytes,
  });
  if (!put.ok) {
    throw new PublisherError(`Upload da imagem para o LinkedIn falhou (${put.status}).`, {
      retryable: put.status >= 500,
    });
  }
  return imageUrn;
}

export async function publishLinkedIn(input: PublishInput): Promise<PublishResult> {
  const accessToken = token(input);
  const author = authorUrn(input);
  const text = composeCaption(input.payload.title, input.payload.body);

  const mediaUrls = (input.payload.media_urls ?? []).filter(isFetchableUrl);
  const imageUrl = mediaUrls.find((u) => detectMediaKind(u) === "image");
  const videoUrl = mediaUrls.find((u) => detectMediaKind(u) === "video");

  let content: Record<string, unknown>;

  if (imageUrl) {
    const imageUrn = await uploadImage(input, accessToken, author, imageUrl);
    content = {
      media: { title: (input.payload.title ?? "").slice(0, 200), id: imageUrn },
    };
  } else if (videoUrl) {
    // Video upload is a multi-part protocol; fail honestly instead of posting
    // a link-only update the user did not ask for.
    throw new PublisherError(
      "Vídeo no LinkedIn exige o fluxo de upload em partes, ainda não habilitado. " +
        "Publique como imagem ou use o LinkedIn diretamente.",
      { retryable: false },
    );
  } else {
    content = { article: { source: "https://www.linkedin.com/feed/" } };
  }

  const body = {
    author,
    commentary: text,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    content: imageUrl ? content : undefined,
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  await beforeProviderWrite(input);
  const res = await fetch(`${LINKEDIN_API}/posts`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: headers(accessToken),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    throw new PublisherError(`LinkedIn recusou a publicação (${res.status}): ${detail}`, {
      retryable: res.status === 429,
      definiteRejection: [400, 401, 403, 429].includes(res.status),
    });
  }

  // LinkedIn returns the post URN in the x-restli-id header, not the body.
  const urn = res.headers.get("x-restli-id");
  if (!urn?.trim())
    throw new PublisherError(
      "LinkedIn não retornou o identificador da publicação. Verifique o provedor antes de tentar novamente.",
      { retryable: false },
    );
  const reference = { kind: "linkedin_post" as const, id: urn };
  await preservePublicationReference(input, reference);
  return confirmPublication(input, reference, accessToken);
}
