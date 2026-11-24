import type {
  LearningPage,
  LearningPath,
  LearningProgress,
  LearningReceipt,
} from "@/lib/learning/contracts";
import { learningCatalogVersion, learningProgressEqual } from "@/lib/learning/contracts";

export type LearningIntent = {
  pathId: string;
  milestoneId: string;
  completed: boolean;
  expectedCatalog: string;
  expectedProgress: LearningProgress | null;
  observedPath: LearningPath;
};
export type LearningView = {
  page: number;
  intent: LearningIntent | null;
  receipt: LearningReceipt | null;
};
export const learningCatalogKey = (userId: string, page: number) =>
  ["learning", userId, "catalog", page] as const;
export const learningProgressKey = (userId: string, paths: LearningPath[]) =>
  ["learning", userId, "progress", paths.map(learningCatalogVersion)] as const;
export const learningViewKey = (userId: string) => ["learning", userId, "temporary-view"] as const;
export function learningIntentMatches(
  intent: LearningIntent,
  path: LearningPath | undefined,
  current: LearningProgress | null | undefined,
) {
  return (
    !!path &&
    current !== undefined &&
    intent.pathId === path.id &&
    intent.expectedCatalog === learningCatalogVersion(path) &&
    path.milestones.some((item) => item.id === intent.milestoneId) &&
    learningProgressEqual(intent.expectedProgress, current)
  );
}
export function learningLastPage(page: Pick<LearningPage, "total" | "pageSize">) {
  return Math.max(1, Math.ceil(page.total / page.pageSize));
}
export function learningDate(value: string, language: string) {
  return new Intl.DateTimeFormat(language, {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
