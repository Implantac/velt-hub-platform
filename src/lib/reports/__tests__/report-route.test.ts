import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getClaims: vi.fn(), build: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getClaims: mocks.getClaims } }),
}));
vi.mock("@/lib/reports/report.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reports/report.server")>();
  return { ...actual, buildWeeklyReport: mocks.build };
});

import { Route } from "@/routes/api/reports/weekly";
import { ReportWorkspaceUnavailableError } from "@/lib/reports/report.server";

type GetHandler = (args: { request: Request }) => Promise<Response>;
const get = (Route.options as unknown as { server: { handlers: { GET: GetHandler } } }).server
  .handlers.GET;
const workspaceId = "11111111-1111-4111-8111-111111111111";
function request({ workspace = workspaceId, token = "QA_TEST_TOKEN", format = "pdf" } = {}) {
  return new Request(
    `https://velt.example.invalid/api/reports/weekly?workspaceId=${workspace}&format=${format}`,
    { headers: token ? { authorization: `Bearer ${token}` } : {} },
  );
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://qa.example.invalid");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "QA_TEST_PUBLIC_KEY");
  mocks.getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: "QA_TEST_USER" } } });
  mocks.build.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("weekly report HTTP boundary", () => {
  it.each(["", "invalid", "------------------------------------"])(
    "rejects an invalid workspace before authentication or database work: %s",
    async (workspace) => {
      const response = await get({ request: request({ workspace }) });
      expect(response.status).toBe(400);
      expect(mocks.getClaims).not.toHaveBeenCalled();
      expect(mocks.build).not.toHaveBeenCalled();
    },
  );

  it("rejects missing authentication", async () => {
    expect((await get({ request: request({ token: "" }) })).status).toBe(401);
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it.each(["returned", "thrown"])(
    "rejects %s invalid claims without generating a report",
    async (mode) => {
      if (mode === "returned")
        mocks.getClaims.mockResolvedValue({ error: new Error("QA_PRIVATE_AUTH") });
      else mocks.getClaims.mockRejectedValue(new Error("QA_PRIVATE_AUTH"));
      const response = await get({ request: request() });
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain("QA_PRIVATE_AUTH");
      expect(mocks.build).not.toHaveBeenCalled();
    },
  );

  it("does not expose configuration names when the server is unavailable", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    const response = await get({ request: request() });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(/SUPABASE|KEY|URL/);
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it("returns the same safe 404 for an absent workspace or one hidden by RLS", async () => {
    mocks.build.mockRejectedValue(new ReportWorkspaceUnavailableError());
    const response = await get({ request: request() });
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "Workspace não encontrado ou acesso não permitido.",
    });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("keeps genuine database/render failures distinct from a permission miss", async () => {
    mocks.build.mockRejectedValue(new Error("QA_PRIVATE_DATABASE_DETAIL"));
    const response = await get({ request: request() });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("QA_PRIVATE_DATABASE_DETAIL");
  });

  it.each([
    ["pdf", "application/pdf"],
    ["csv", "text/csv"],
  ])("serves an authenticated %s as a private attachment", async (format, contentType) => {
    mocks.build.mockResolvedValue({
      data: { window: { end: "2026-11-12T12:00:00.000Z" } },
      pdf: new TextEncoder().encode("%PDF-QA-SYNTHETIC"),
      csv: "secao,metrica,valor_semana\nmetrica,Impressões,700",
    });
    const response = await get({ request: request({ format }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(contentType);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="relatorio-semanal-2026-11-12.${format}"`,
    );
    expect(mocks.build).toHaveBeenCalledWith(expect.any(Object), workspaceId);
    expect(await response.text()).toContain(format === "pdf" ? "%PDF-" : "700");
  });
});
