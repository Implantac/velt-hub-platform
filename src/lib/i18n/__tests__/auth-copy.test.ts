import { describe, expect, it } from "vitest";
import { createI18nInstance } from "..";

describe("account confirmation copy", () => {
  it.each(["pt-BR", "en-US"] as const)(
    "shows the submitted address instead of a template placeholder in %s",
    (language) => {
      const email = "qa-confirmation@example.invalid";
      const text = createI18nInstance(language).t("auth.checkEmailBody", { email });
      expect(text).toContain(email);
      expect(text).not.toMatch(/\{\{?email\}?\}/);
    },
  );
});
