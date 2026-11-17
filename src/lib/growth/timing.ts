import { z } from "zod";
import { ALL_PLATFORMS } from "./platform-rules";

const confidence = z.enum(["observed", "baseline"]);
/** Language-independent read contract; a serialized error or wrong-context result is not a suggestion. */
export const timingRecommendationSchema = z
  .object({
    workspaceId: z.string().uuid(),
    platform: z.enum(ALL_PLATFORMS),
    channel: z
      .object({ id: z.string().uuid(), handle: z.string().nullable(), status: z.string() })
      .nullable(),
    timeZone: z.string(),
    referenceAt: z.string().datetime(),
    best: z.object({
      at: z.string().datetime(),
      confidence,
      samples: z.number().int().nonnegative(),
    }),
    topSlots: z
      .array(
        z.object({
          at: z.string().datetime(),
          weekday: z.number().int().min(0).max(6),
          hour: z.number().int().min(0).max(23),
          samples: z.number().int().nonnegative(),
          confidence,
        }),
      )
      .max(6),
    usedFallback: z.boolean(),
    observationsCount: z.number().int().min(0).max(300),
    basis: z.enum(["engagement_rate", "engagement_count"]),
    minimum: z.object({ total: z.number().int().positive(), perSlot: z.number().int().positive() }),
    history: z.object({
      days: z.number().int().positive(),
      maxJobs: z.number().int().positive(),
      latestCapturedAt: z.string().datetime().nullable(),
    }),
    cadence: z.object({
      perWeek: z.number().int().positive(),
      source: z.enum(["profile", "platform-default"]),
      reasonCode: z.enum(["low_budget", "daily_budget", "beginner", "platform_default"]),
      hoursPerWeek: z.number().positive().max(168).nullable(),
    }),
  })
  .superRefine((value, ctx) => {
    const inconsistent =
      value.usedFallback !== (value.best.confidence === "baseline") ||
      Date.parse(value.best.at) <= Date.parse(value.referenceAt) ||
      Date.parse(value.best.at) % 60_000 !== 0 ||
      (value.best.confidence === "baseline" && value.best.samples !== 0) ||
      (value.best.confidence === "observed" &&
        (!value.channel ||
          value.observationsCount < value.minimum.total ||
          value.best.samples < value.minimum.perSlot)) ||
      value.best.samples > value.observationsCount ||
      (!value.channel && value.observationsCount !== 0);
    if (inconsistent) ctx.addIssue({ code: "custom", message: "Inconsistent timing evidence" });
  });
export type TimingRecommendation = z.infer<typeof timingRecommendationSchema>;
