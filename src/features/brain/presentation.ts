import { PRODUCT_TZ } from "@/lib/growth/scheduling";
import type { BrainLanguage } from "@/lib/brain/native";

export type BrainReadState = "loading" | "error" | "stale" | "ready";
export type BrainReadModule = "recommendations" | "memories";
export function brainReadState(query: { data: unknown; isError: boolean }): BrainReadState {
  if (query.data === undefined) return query.isError ? "error" : "loading";
  return query.isError ? "stale" : "ready";
}
export function brainQueryKey(module: BrainReadModule, workspaceId: string, userId: string) {
  return [
    module === "recommendations" ? "brain-native-recs" : "brain-native-mem",
    workspaceId,
    userId,
  ] as const;
}
export function canReadBrain(role: string | null | undefined) {
  return role === "owner" || role === "admin" || role === "editor" || role === "viewer";
}
export function brainLanguage(language: string): BrainLanguage {
  return language.toLowerCase().split("-")[0] === "en" ? "en-US" : "pt-BR";
}
export function brainDate(value: string, language: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(brainLanguage(language), {
    timeZone: PRODUCT_TZ,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
