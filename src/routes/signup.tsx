import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { requestLang, translateServer } from "@/lib/i18n/translate";
import { SignupPage } from "@/features/auth/components/SignupPage";

export const Route = createFileRoute("/signup")({
  head: async () => {
    const lang = await requestLang();
    return {
      meta: [{ title: translateServer(lang, "routes", "signup", "Create account · VELT") }],
    };
  },
  component: SignupRoute,
});

function SignupRoute() {
  const navigate = useNavigate();
  const onAuthenticated = useCallback(() => {
    void navigate({ to: "/app", replace: true });
  }, [navigate]);
  return <SignupPage onAuthenticated={onAuthenticated} />;
}
