import { describe, expect, it } from "vitest";
import {
  brainDate,
  brainLanguage,
  brainQueryKey,
  brainReadState,
  canReadBrain,
} from "../presentation";

describe("native Brain scoped presentation", () => {
  it.each([
    [undefined, false, "loading"],
    [undefined, true, "error"],
    [{ items: [], total: 0 }, false, "ready"],
    [{ items: [], total: 0 }, true, "stale"],
  ] as const)("distinguishes initial/stale reading %#", (data, isError, expected) => {
    expect(brainReadState({ data, isError })).toBe(expected);
  });
  it.each(["recommendations", "memories"] as const)(
    "keys %s by both user and workspace",
    (module) => {
      expect(brainQueryKey(module, "ws-a", "user-a")).not.toEqual(
        brainQueryKey(module, "ws-b", "user-a"),
      );
      expect(brainQueryKey(module, "ws-a", "user-a")).not.toEqual(
        brainQueryKey(module, "ws-a", "user-b"),
      );
      expect(brainQueryKey(module, "ws-a", "user-a")).toHaveLength(3);
    },
  );
  it.each(["owner", "admin", "editor", "viewer"])("accepts read role %s", (role) =>
    expect(canReadBrain(role)).toBe(true),
  );
  it.each([null, undefined, "unknown", "", "OWNER"])("fails closed for role %#", (role) =>
    expect(canReadBrain(role)).toBe(false),
  );
  it.each([
    ["en-US", "en-US"],
    ["en", "en-US"],
    ["EN-gb", "en-US"],
    ["pt-BR", "pt-BR"],
    ["pt", "pt-BR"],
    ["fr", "pt-BR"],
  ] as const)("normalizes %s", (input, expected) => expect(brainLanguage(input)).toBe(expected));
  it.each(["pt-BR", "en-US"])(
    "uses product zone independently of browser default in %s",
    (language) => {
      const result = brainDate("2026-11-12T01:30:00Z", language)!;
      expect(result).toContain("11");
      expect(result).toContain("2026");
      expect(result).toContain(language === "pt-BR" ? "22:30" : "10:30");
      expect(result).toMatch(/BRT|GMT-3|22:30/);
      expect(brainDate("invalid", language)).toBeNull();
    },
  );
});
