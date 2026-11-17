/**
 * Pure timing heuristics, not a performance forecast. Local windows are
 * interpreted in the explicitly requested IANA zone. Measured history and
 * editorial defaults remain separate; callers must supply attributed data.
 */
import { rulesFor, type PlatformId } from "./platform-rules";
import { shiftCalendarDate, zonedInstants, zonedParts } from "@/lib/time-zones";

/** Compatibility default for existing Brain consumers; the scheduler requests its zone explicitly. */
export const PRODUCT_TZ = "America/Sao_Paulo";
export const PRODUCT_TZ_OFFSET_MIN = -180;
export const MIN_OBSERVATIONS_PER_SLOT = 2;
export const MIN_OBSERVATIONS_TOTAL = 6;
export type SlotConfidence = "observed" | "baseline";

export interface SlotObservation {
  /** Recorded send-start instant for the timing card, not a certified public-live timestamp. */
  publishedAt: string;
  engagement: number;
  impressions?: number;
}
export interface RankedSlot {
  /** Local weekday/hour in the zone passed to rankSlots, not a fixed UTC hour. */
  weekday: number;
  hour: number;
  /** Relative score, never probability, percentage lift or predicted engagement. */
  score: number;
  samples: number;
  confidence: SlotConfidence;
  /** Legacy Portuguese explanation for internal consumers; the scheduler uses structured fields. */
  reason: string;
}
export interface NextSlot {
  at: string;
  label: string;
  confidence: SlotConfidence;
  reason: string;
  samples: number;
}

export function localSlot(iso: string, timeZone = PRODUCT_TZ): { weekday: number; hour: number } {
  const { weekday, hour } = zonedParts(iso, timeZone);
  return { weekday, hour };
}
/** Legacy fixed-UTC-3 helper; not used to convert contextual/DST-aware windows. */
export function toUtcHour(localHour: number): number {
  return (localHour - PRODUCT_TZ_OFFSET_MIN / 60 + 24) % 24;
}
export function validObservations(observations: SlotObservation[]): SlotObservation[] {
  return observations.filter(
    (o) =>
      Number.isFinite(Date.parse(o.publishedAt)) &&
      Number.isFinite(o.engagement) &&
      o.engagement >= 0 &&
      o.engagement <= Number.MAX_SAFE_INTEGER &&
      (o.impressions === undefined ||
        (Number.isFinite(o.impressions) &&
          o.impressions >= 0 &&
          o.impressions <= Number.MAX_SAFE_INTEGER)),
  );
}
export function observationBasis(observations: SlotObservation[]) {
  const valid = validObservations(observations);
  return valid.length > 0 && valid.every((o) => o.impressions !== undefined && o.impressions > 0)
    ? ("engagement_rate" as const)
    : ("engagement_count" as const);
}

export function rankSlots(
  platform: PlatformId | string,
  observations: SlotObservation[],
  timeZone = PRODUCT_TZ,
): RankedSlot[] {
  const rules = rulesFor(String(platform));
  const valid = validObservations(observations);
  // Use one comparable unit for the whole ranking, never ratios for some rows
  // and raw counts for others. The UI states which basis was possible.
  const basis = observationBasis(valid);
  const buckets = new Map<string, number[]>();
  for (const o of valid) {
    const { weekday, hour } = localSlot(o.publishedAt, timeZone);
    const key = `${weekday}:${hour}`;
    const values = buckets.get(key) ?? [];
    values.push(basis === "engagement_rate" ? o.engagement / o.impressions! : o.engagement);
    buckets.set(key, values);
  }
  const observed: RankedSlot[] = [];
  for (const [key, values] of buckets) {
    if (values.length < MIN_OBSERVATIONS_PER_SLOT) continue;
    const [weekday, hour] = key.split(":").map(Number);
    observed.push({
      weekday,
      hour,
      score: values.reduce((a, b) => a + b / values.length, 0),
      samples: values.length,
      confidence: "observed",
      reason: `Média de ${values.length} envios registrados neste horário`,
    });
  }
  const max = Math.max(0, ...observed.map((s) => s.score));
  if (valid.length >= MIN_OBSERVATIONS_TOTAL && max > 0) {
    observed.forEach((s) => (s.score /= max));
    return observed.sort(
      (a, b) =>
        b.score - a.score || b.samples - a.samples || a.weekday - b.weekday || a.hour - b.hour,
    );
  }
  const baseline: RankedSlot[] = [];
  const windows = rules?.baselineWindows ?? [
    { weekday: [1, 2, 3, 4, 5], startHour: 11, endHour: 13 },
  ];
  for (const w of windows) {
    for (const weekday of w.weekday) {
      for (let hour = w.startHour; hour < w.endHour; hour++) {
        const mid = (w.startHour + w.endHour - 1) / 2;
        const closeness = 1 - Math.abs(hour - mid) / Math.max(1, w.endHour - w.startHour);
        baseline.push({
          weekday,
          hour,
          score: 0.5 + closeness * 0.4,
          samples: 0,
          confidence: "baseline",
          reason: `Janela padrão de ${rules?.label ?? "rede"} — sem histórico suficiente para personalizar`,
        });
      }
    }
  }
  return baseline.sort((a, b) => b.score - a.score);
}

const WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** Legacy fixed-UTC-3 label for existing integrations, not contextual UI. */
export function formatSlotLabel(weekday: number, hourUtc: number): string {
  const local = (hourUtc + PRODUCT_TZ_OFFSET_MIN / 60 + 24) % 24;
  return `${WEEKDAY_LABELS[weekday] ?? "?"} ${String(local).padStart(2, "0")}:00`;
}

/** Next real occurrence, skipping nonexistent local times and respecting overlap instants/lead time. */
export function nextSlotOccurrence(
  slot: Pick<RankedSlot, "weekday" | "hour">,
  from: Date,
  timeZone = PRODUCT_TZ,
  leadMinutes = 30,
): { at: Date; daysAhead: number } | null {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(leadMinutes) || leadMinutes < 0)
    throw new RangeError("Invalid scheduling reference");
  const local = zonedParts(from, timeZone);
  const earliest = from.getTime() + leadMinutes * 60_000;
  for (let daysAhead = 0; daysAhead < 15; daysAhead++) {
    if ((local.weekday + daysAhead) % 7 !== slot.weekday) continue;
    const date = shiftCalendarDate(local, daysAhead);
    for (const at of zonedInstants(date, slot.hour, 0, timeZone)) {
      if (at.getTime() >= earliest) return { at, daysAhead };
    }
  }
  return null;
}

/** Waiting decay is an ordering heuristic, NOT observed percentage loss or uplift. */
const WAIT_DECAY_PER_DAY = 0.92;
export function nextBestSlot(
  platform: PlatformId | string,
  observations: SlotObservation[],
  from: Date = new Date(),
  leadMinutes = 30,
  timeZone = PRODUCT_TZ,
): NextSlot {
  const ranked = rankSlots(platform, observations, timeZone);
  let best: { at: Date; slot: RankedSlot; weighted: number } | null = null;
  for (const slot of ranked) {
    const occurrence = nextSlotOccurrence(slot, from, timeZone, leadMinutes);
    if (!occurrence) continue;
    const weighted = slot.score * Math.pow(WAIT_DECAY_PER_DAY, occurrence.daysAhead);
    if (
      !best ||
      weighted > best.weighted ||
      (weighted === best.weighted && occurrence.at < best.at)
    )
      best = { at: occurrence.at, slot, weighted };
  }
  if (!best) {
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(leadMinutes) || leadMinutes < 0)
      throw new RangeError("Invalid scheduling reference");
    return {
      at: new Date(
        Math.ceil((from.getTime() + leadMinutes * 60_000) / 60_000) * 60_000,
      ).toISOString(),
      label: "próximo horário livre",
      confidence: "baseline",
      reason: "Nenhuma janela válida encontrada nas próximas duas semanas.",
      samples: 0,
    };
  }
  return {
    at: best.at.toISOString(),
    label: new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(best.at),
    confidence: best.slot.confidence,
    reason: best.slot.reason,
    samples: best.slot.samples,
  };
}

export interface CadenceTarget {
  perWeek: number;
  rationale: string;
  source: "profile" | "platform-default";
  reasonCode: "low_budget" | "daily_budget" | "beginner" | "platform_default";
  hoursPerWeek: number | null;
}
export function cadenceTarget(
  platform: PlatformId | string,
  profile?: { time_budget_hours_week?: number | null; experience_level?: string | null } | null,
): CadenceTarget {
  const rawHours = profile?.time_budget_hours_week;
  const hours =
    typeof rawHours === "number" && Number.isFinite(rawHours) && rawHours > 0 && rawHours <= 168
      ? rawHours
      : 0;
  const level = profile?.experience_level ?? "beginner";
  if (hours > 0 && hours < 3)
    return {
      perWeek: 2,
      rationale: `Com ${hours}h/semana, a referência inicial é de 2 publicações; ajuste à sua rotina.`,
      source: "profile",
      reasonCode: "low_budget",
      hoursPerWeek: hours,
    };
  if (hours >= 10)
    return {
      perWeek: 7,
      rationale: `Com ${hours}h/semana, uma publicação diária é uma referência, não uma obrigação.`,
      source: "profile",
      reasonCode: "daily_budget",
      hoursPerWeek: hours,
    };
  const byPlatform: Record<string, number> = {
    instagram: 4,
    tiktok: 5,
    youtube: 2,
    linkedin: 3,
    facebook: 3,
    x: 7,
    threads: 5,
    pinterest: 3,
  };
  const base = byPlatform[String(platform)] ?? 3;
  return {
    perWeek: level === "beginner" ? Math.max(2, base - 1) : base,
    rationale:
      level === "beginner"
        ? "Cadência inicial conservadora: ajuste à sua rotina."
        : "Referência editorial de cadência para esta plataforma; não é previsão de alcance.",
    source: "platform-default",
    reasonCode: level === "beginner" ? "beginner" : "platform_default",
    hoursPerWeek: null,
  };
}
