import { describe, expect, it } from "vitest";
import {
  InvalidOAuthResponse,
  MAX_TOKEN_SECONDS,
  expiresInToIso,
  parseOAuthTokens,
  readOAuthJson,
  validToken,
} from "../token-response.server";
describe("strict, bounded and secret-free token parsing", () => {
  it("validates real strings without coercing undefined/objects into credentials", () => {
    expect(validToken("QA_TOKEN_123.-~")).toBe(true);
    for (const value of [
      null,
      undefined,
      1,
      {},
      [],
      "",
      " ",
      "undefined",
      "null",
      "a b",
      "a\nb",
      "\u0000",
      "x".repeat(32769),
    ])
      expect(validToken(value)).toBe(false);
  });
  it("accepts a positive finite integer lifetime within the stated bound", () => {
    expect(Date.parse(expiresInToIso(3600)!)).toBeGreaterThan(Date.now());
    expect(expiresInToIso(MAX_TOKEN_SECONDS)).toBeTruthy();
    expect(expiresInToIso(undefined)).toBeUndefined();
    expect(() => expiresInToIso(undefined, true)).toThrow(InvalidOAuthResponse);
  });
  it.each([null, -1, 0, NaN, Infinity, "3600", {}, false, 1.1, MAX_TOKEN_SECONDS + 1])(
    "rejects invalid expiry %j",
    (value) => {
      expect(() => expiresInToIso(value)).toThrow(InvalidOAuthResponse);
    },
  );
  it.each(
    [
      null,
      [],
      123,
      {},
      { access_token: "valid", error: "invalid_grant" },
      { access_token: "valid", refresh_token: null },
      { access_token: "valid", scope: {} },
      { access_token: "valid", token_type: "MAC" },
    ].map((value) => ({ value })),
  )("rejects malformed/contradictory credentials %j", ({ value }) => {
    expect(() => parseOAuthTokens(value)).toThrow(InvalidOAuthResponse);
  });
  it("preserves an omitted refresh token for the caller to resolve, never the literal word undefined", () => {
    expect(
      parseOAuthTokens(
        { access_token: "QA_VALID", expires_in: 3600, token_type: "bearer", scope: "a b" },
        { expiryRequired: true },
      ),
    ).toMatchObject({
      accessToken: "QA_VALID",
      refreshToken: undefined,
      tokenType: "bearer",
      scope: "a b",
    });
  });
  it("requires a rotating refresh credential when requested", () => {
    expect(() =>
      parseOAuthTokens({ access_token: "QA_VALID", expires_in: 3600 }, { refreshRequired: true }),
    ).toThrow();
  });
  it("does not embed a rejected provider value in the error", () => {
    try {
      parseOAuthTokens(
        { access_token: "QA_SECRET_VALUE", expires_in: "QA_SECRET_VALUE" },
        { expiryRequired: true },
      );
    } catch (error) {
      expect((error as Error).message).not.toContain("QA_SECRET_VALUE");
    }
  });
  it("parses JSON only within a bounded response body", async () => {
    await expect(readOAuthJson(Response.json({ access_token: "QA_TOKEN" }))).resolves.toEqual({
      access_token: "QA_TOKEN",
    });
    await expect(readOAuthJson(new Response("x".repeat(131073)))).rejects.toBeInstanceOf(
      InvalidOAuthResponse,
    );
  });
  it("counts UTF-8 bytes, not characters, across response chunks", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ text: "é".repeat(40) }));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 50));
        controller.enqueue(bytes.subarray(50));
        controller.close();
      },
    });
    await expect(readOAuthJson(new Response(body), 80)).rejects.toBeInstanceOf(
      InvalidOAuthResponse,
    );
  });
  it("allows an explicitly bounded discovery size without widening the default exchange limit", async () => {
    const data = { ignored: "x".repeat(131_073) };
    await expect(readOAuthJson(Response.json(data), 1_048_576)).resolves.toEqual(data);
    await expect(readOAuthJson(Response.json(data))).rejects.toBeInstanceOf(InvalidOAuthResponse);
  });
  it("never includes invalid JSON text in an exception", async () => {
    await expect(readOAuthJson(new Response("QA_SECRET_MUST_NOT_APPEAR"))).rejects.toThrow(
      "Invalid OAuth credential response",
    );
  });
});
