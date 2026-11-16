/** Strict provider-response validation. Never put an upstream value in an error. */
export class InvalidOAuthResponse extends Error {
  constructor() {
    super("Invalid OAuth credential response");
    this.name = "InvalidOAuthResponse";
  }
}
export const MAX_TOKEN_SECONDS = 366 * 24 * 60 * 60;
export function validToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 32768 &&
    /^[\x21-\x7e]+$/.test(value) &&
    !["undefined", "null", "[object Object]"].includes(value)
  );
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvalidOAuthResponse();
  return value as Record<string, unknown>;
}
export function expiresInToIso(value: unknown, required = false): string | undefined {
  if (value === undefined && !required) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > MAX_TOKEN_SECONDS
  )
    throw new InvalidOAuthResponse();
  return new Date(Date.now() + value * 1000).toISOString();
}
function optionalString(value: unknown, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > max || /\p{Cc}/u.test(value))
    throw new InvalidOAuthResponse();
  return value;
}
export interface ParsedOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  tokenType?: string;
  scope?: string;
}
export function parseOAuthTokens(
  value: unknown,
  options: { expiryRequired?: boolean; refreshRequired?: boolean } = {},
): ParsedOAuthTokens {
  const data = record(value);
  if (data.error || data.error_description || !validToken(data.access_token))
    throw new InvalidOAuthResponse();
  if (data.refresh_token !== undefined && !validToken(data.refresh_token))
    throw new InvalidOAuthResponse();
  if (options.refreshRequired && !validToken(data.refresh_token)) throw new InvalidOAuthResponse();
  const tokenType = optionalString(data.token_type, 40);
  if (tokenType !== undefined && !/^Bearer$/i.test(tokenType)) throw new InvalidOAuthResponse();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token as string | undefined,
    expiresAt: expiresInToIso(data.expires_in, options.expiryRequired),
    tokenType,
    scope: optionalString(data.scope, 8192),
  };
}

/** Bounded read; the signal on fetch also covers the response body. */
export async function readOAuthJson(response: Response, maxBytes = 131_072): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new InvalidOAuthResponse();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new InvalidOAuthResponse();
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8")) as unknown;
  } catch {
    await reader.cancel().catch(() => {});
    throw new InvalidOAuthResponse();
  } finally {
    reader.releaseLock();
  }
}
