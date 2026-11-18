import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { requestLang, translateServer } from "@/lib/i18n/translate";
import { loginSearch, safeAppReturnTo } from "@/lib/auth/return-to";
import { LoginPage } from "@/features/auth/components/LoginPage";

export const Route = createFileRoute("/login")({
  validateSearch: loginSearch,
  head: async () => {
    const lang = await requestLang();
    return { meta: [{ title: translateServer(lang, "routes", "login", "Sign in · VELT") }] };
  },
  component: LoginRoute,
});

function LoginRoute() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const returnTo = safeAppReturnTo(search.redirect ?? "/app");
  const onAuthenticated = useCallback(() => {
    void navigate({ to: returnTo, replace: true });
  }, [navigate, returnTo]);
  return (
    <LoginPage
      returnTo={returnTo}
      recoveryRequested={search.mode === "reset"}
      onAuthenticated={onAuthenticated}
    />
  );
}
