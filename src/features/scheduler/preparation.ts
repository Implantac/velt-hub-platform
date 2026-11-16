import type { SchedulingOptions } from "@/lib/scheduler/scheduling";

const BLOCKED_REASONS = ["oauth", "environment", "location", "unsupported", "direct_post"] as const;
export type PreparationReason = (typeof BLOCKED_REASONS)[number] | "none" | "other";
export type SchedulingPreparation =
  | { kind: "readonly" | "draft" | "ready"; availableChannels: number }
  | { kind: "channels"; availableChannels: number; reason: PreparationReason };

/** Guidance from authorized options, never a replacement for server authorization or preflight. */
export function schedulingPreparation(
  options: SchedulingOptions,
  canEdit: boolean,
): SchedulingPreparation {
  const availableChannels = options.channels.filter((channel) => channel.eligible).length;
  if (!canEdit) return { kind: "readonly", availableChannels };
  if (options.contents.length === 0) return { kind: "draft", availableChannels };
  if (availableChannels > 0) return { kind: "ready", availableChannels };
  if (options.channels.length === 0) return { kind: "channels", availableChannels, reason: "none" };

  const reasons = new Set(options.channels.map((channel) => channel.reason));
  const reason = BLOCKED_REASONS.find((candidate) => reasons.size === 1 && reasons.has(candidate));
  return { kind: "channels", availableChannels, reason: reason ?? "other" };
}
