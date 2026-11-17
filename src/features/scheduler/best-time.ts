import { PUBLISH_ENABLED, isPlatformId, type PlatformId } from "@/lib/growth/platform-rules";
import { timingRecommendationSchema } from "@/lib/growth/timing";
import type { SchedulingOptions } from "@/lib/scheduler/scheduling";

export interface TimingContext {
  platform: PlatformId;
  channelId?: string;
}
/** Deleted/stale/unknown channel selections must not silently become platform references. */
export function timingContext(
  value: string,
  channels: SchedulingOptions["channels"],
): TimingContext | null {
  if (value.startsWith("channel:")) {
    const channel = channels.find((c) => c.id === value.slice(8));
    return channel && isPlatformId(channel.platform)
      ? { platform: channel.platform, channelId: channel.id }
      : null;
  }
  if (value.startsWith("reference:")) {
    const platform = value.slice(10);
    return isPlatformId(platform) && PUBLISH_ENABLED.has(platform) ? { platform } : null;
  }
  return null;
}
export function parseTimingResult(
  raw: unknown,
  workspaceId: string,
  context: TimingContext,
  timeZone: string,
) {
  const data = timingRecommendationSchema.parse(raw);
  if (
    data.workspaceId !== workspaceId ||
    data.platform !== context.platform ||
    (data.channel?.id ?? undefined) !== context.channelId ||
    data.timeZone !== timeZone
  )
    throw new Error("Timing result does not match the requested context");
  return data;
}
