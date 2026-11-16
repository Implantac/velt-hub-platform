/** Durable, non-secret correlation keys. A resource/container is not a public post. */
import { PublisherError, type Platform, type PublishInput } from "./contracts";

export type PublicationReferenceKind =
  | "instagram_container"
  | "instagram_media"
  | "facebook_post"
  | "facebook_photo"
  | "facebook_video"
  | "youtube_video"
  | "linkedin_post"
  | "tiktok_publish"
  | "google_local_post";

export interface PublicationReference {
  kind: PublicationReferenceKind;
  id: string;
}

function nonempty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() === value && value.length > 0
    ? value
    : undefined;
}

/** Use the connected account's identity, never an unrelated metadata override. */
export function publicationTarget(platform: Platform, cfg: Record<string, unknown>): string {
  const external = nonempty(cfg.external_id);
  let target: string | undefined;
  const consistent = (candidate: unknown, canonical: string | undefined) => {
    const configured = nonempty(candidate);
    if (configured && canonical && configured !== canonical)
      throw new PublisherError("A configuração aponta para outra conta. Reconecte o canal.");
    return canonical ?? configured;
  };
  switch (platform) {
    case "facebook":
      target = consistent(cfg.page_id, external);
      if (target && /^\d+$/.test(target)) return target;
      break;
    case "instagram":
      target = consistent(cfg.ig_user_id ?? cfg.igUserId, external);
      if (target && /^\d+$/.test(target)) return target;
      break;
    case "google_business": {
      const account = nonempty(cfg.account_id);
      const location = nonempty(cfg.location_id);
      const canonical = external?.match(/^accounts\/(\d+)\/locations\/(\d+)$/);
      if (external && !canonical) break;
      const a = consistent(account, canonical?.[1]);
      const l = consistent(location, canonical?.[2]);
      if (a && l && /^\d+$/.test(a) && /^\d+$/.test(l)) return `accounts/${a}/locations/${l}`;
      break;
    }
    case "linkedin": {
      const org = nonempty(cfg.organization_id);
      const person = nonempty(cfg.person_id);
      if (external?.startsWith("urn:li:")) target = external;
      else if (org) target = `urn:li:organization:${consistent(org, external)}`;
      else {
        const id = consistent(person, external);
        if (id) target = `urn:li:person:${id}`;
      }
      if (target && /^urn:li:(person|organization):[A-Za-z0-9_-]+$/.test(target)) return target;
      break;
    }
    case "youtube":
    case "tiktok":
      if (external && /^[A-Za-z0-9_.~-]{1,200}$/.test(external)) return external;
      break;
  }
  throw new PublisherError("O canal não tem uma identidade de provedor válida. Reconecte o canal.");
}

export function validPublicationReference(
  platform: string,
  target: string,
  reference: PublicationReference,
): boolean {
  const id = reference.id;
  if (typeof id !== "string" || id.length < 1 || id.length > 300) return false;
  switch (platform) {
    case "instagram":
      return (
        ["instagram_container", "instagram_media"].includes(reference.kind) && /^\d+$/.test(id)
      );
    case "facebook":
      return reference.kind === "facebook_post"
        ? /^\d+_\d+$/.test(id) && id.split("_")[0] === target
        : ["facebook_photo", "facebook_video"].includes(reference.kind) && /^\d+$/.test(id);
    case "youtube":
      return reference.kind === "youtube_video" && /^[A-Za-z0-9_-]{6,128}$/.test(id);
    case "linkedin":
      return reference.kind === "linkedin_post" && /^urn:li:(share|ugcPost):\d+$/.test(id);
    case "tiktok":
      return reference.kind === "tiktok_publish" && /^[A-Za-z0-9_~.-]{1,200}$/.test(id);
    case "google_business":
      return (
        reference.kind === "google_local_post" &&
        /^accounts\/\d+\/locations\/\d+\/localPosts\/[A-Za-z0-9_-]+$/.test(id) &&
        id.startsWith(`${target}/localPosts/`)
      );
    default:
      return false;
  }
}

/** Await the database boundary BEFORE a write; a failed acknowledgement stops the write. */
export async function beforeProviderWrite(input: Pick<PublishInput, "beforeWrite">): Promise<void> {
  await input.beforeWrite?.();
}

/** Await durable storage before upload/poll/next write; preserve the reference on an RPC error. */
export async function preservePublicationReference(
  input: PublishInput,
  reference: PublicationReference,
): Promise<void> {
  const target = publicationTarget(input.platform, input.channelConfig);
  if (!validPublicationReference(input.platform, target, reference))
    throw new PublisherError(
      "O provedor retornou uma referência inválida; confira antes de repetir.",
    );
  try {
    await input.checkpoint?.(reference);
  } catch {
    throw new PublisherError(
      "Não foi possível confirmar o checkpoint do envio. A referência foi preservada para revisão, sem repetir a publicação.",
      { reference },
    );
  }
}
