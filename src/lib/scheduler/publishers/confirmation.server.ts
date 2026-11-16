import { PublisherError, type PublishInput, type PublishResult } from "../contracts";
import { observePublication } from "../observe.server";
import { publicationTarget, type PublicationReference } from "../references";

/** One read, not another send. Pending visibility is resumed durably by the scheduler. */
export async function confirmPublication(
  input: PublishInput,
  reference: PublicationReference,
  accessToken: string,
): Promise<PublishResult> {
  const outcome = await observePublication({
    platform: input.platform,
    target: publicationTarget(input.platform, input.channelConfig),
    reference,
    accessToken,
  });
  if (outcome.state === "confirmed") return { externalPostId: outcome.externalPostId };
  throw new PublisherError(outcome.note, { reference });
}
