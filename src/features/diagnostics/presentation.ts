import {
  DIAGNOSTIC_READ_ROLES,
  HEALTH_CATEGORIES,
  healthMethod,
  type DiagnosticKind,
  type HealthRecord,
} from "@/lib/diagnostics/contracts";

export function canReadDiagnostics(role: string | null | undefined) {
  return DIAGNOSTIC_READ_ROLES.some((allowed) => allowed === role);
}
export const diagnosticQueryRoot = (workspaceId: string, userId: string) =>
  ["diagnostics", workspaceId, userId] as const;
export const diagnosticQueryKey = (kind: DiagnosticKind, workspaceId: string, userId: string) =>
  [...diagnosticQueryRoot(workspaceId, userId), kind] as const;
export function diagnosticDate(value: string, language: string) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Intl.DateTimeFormat(language.startsWith("en") ? "en-US" : "pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(time);
}
export type DiagnosticFeedback = {
  kind: "saved" | "unconfirmed" | "refreshed";
  readFailed?: boolean;
  snapshotMissing?: boolean;
  answersStale?: boolean;
};
export function feedbackAfterDiagnosticRead(
  current: DiagnosticFeedback | null,
  confirmed: boolean,
) {
  if (current?.kind === "unconfirmed") return current;
  if (current?.kind === "saved") return { ...current, readFailed: !confirmed };
  return confirmed ? { kind: "refreshed" as const } : null;
}
export function healthHistory(rows: HealthRecord[]) {
  const methods = rows.map(healthMethod);
  const versions = rows.map(
    (row, index) => methods[index]?.diagnostic.calculationId ?? `legacy:${row.computed_at}`,
  );
  const common = methods[0]?.diagnostic;
  return {
    missing: HEALTH_CATEGORIES.filter((category) => !rows.some((row) => row.category === category)),
    mixed: new Set(versions).size > 1,
    legacy: methods.some((method) => method === null),
    commonMethod:
      common &&
      methods.every((method) => JSON.stringify(method?.diagnostic) === JSON.stringify(common))
        ? common
        : null,
  };
}
