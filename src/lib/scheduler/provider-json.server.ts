/** Node 22's source-aware reviver preserves provider int64 identifiers exactly. */
export function parseProviderJson(text: string): unknown {
  return JSON.parse(text, (_key, value: unknown, context?: { source: string }) => {
    if (typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value)) {
      if (context && /^-?\d+$/.test(context.source)) return context.source;
      throw new Error("Provider returned an unsafe numeric identifier");
    }
    return value;
  }) as unknown;
}
