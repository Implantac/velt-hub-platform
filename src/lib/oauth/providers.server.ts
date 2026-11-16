/** OAuth discovery is real; validation, timeouts and redirects fail closed. */
import { z } from "zod";
import { metaGraphBase, metaGraphVersion } from "./meta-version.server";
import type { Database } from "@/integrations/supabase/types";
import { parseOAuthTokens, readOAuthJson, record, validToken } from "./token-response.server";

export interface ProviderTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresAt?: string;
  externalAccountId?: string;
  externalHandle?: string;
  /** Resource identifiers only. Credentials never go in public metadata. */
  metadata?: Record<string, string | boolean | null>;
}
interface ExchangeArgs {
  code: string;
  redirectUri: string;
  /** A reconnect must authorize the same previously chosen account/unit. */
  targetExternalId?: string;
}
export interface Provider {
  platform: Database["public"]["Enums"]["social_platform"];
  authUrl(args: { state: string; redirectUri: string }): string;
  exchange(args: ExchangeArgs): Promise<ProviderTokens>;
}
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} is not configured`);
  return value;
}
export class ProviderConnectionError extends Error {
  constructor(
    public readonly code:
      "account_selection_required" | "no_eligible_account" | "provider_unavailable",
  ) {
    super(code);
    this.name = "ProviderConnectionError";
  }
}
function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ProviderConnectionError("provider_unavailable");
  return parsed.data;
}
const id = z
  .string()
  .min(1)
  .max(300)
  .regex(/^[^\s\p{Cc}]+$/u);
const label = z
  .string()
  .max(500)
  .refine((value) => !/\p{Cc}/u.test(value));
const pageTokenSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => !/\p{Cc}/u.test(value));
async function authorizedJson<T extends z.ZodType>(
  schema: T,
  url: string | URL,
  accessToken: string,
  deadline?: AbortSignal,
): Promise<z.output<T>> {
  if (!validToken(accessToken)) throw new ProviderConnectionError("provider_unavailable");
  const response = await fetch(url, {
    redirect: "error",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: deadline
      ? AbortSignal.any([deadline, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new ProviderConnectionError("provider_unavailable");
  }
  // Discovery pages can exceed a token response, but must remain bounded too.
  const json = record(await readOAuthJson(response, 1_048_576));
  if (json.error) throw new ProviderConnectionError("provider_unavailable");
  return parse(schema, json);
}
async function exchangeJson(
  url: string | URL,
  body?: URLSearchParams,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    ...(body
      ? { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }
      : {}),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new ProviderConnectionError("provider_unavailable");
  }
  return record(await readOAuthJson(response));
}
function googleAuthUrl(scope: string, state: string, redirectUri: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    state,
    scope,
  }).toString();
  return url.href;
}
async function googleExchange({ code, redirectUri }: ExchangeArgs) {
  const json = await exchangeJson(
    "https://oauth2.googleapis.com/token",
    new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  );
  return parseOAuthTokens(json, { expiryRequired: true });
}

function metaProvider(platform: "facebook" | "instagram"): Provider {
  return {
    platform,
    authUrl({ state, redirectUri }) {
      const url = new URL(`https://www.facebook.com/${metaGraphVersion()}/dialog/oauth`);
      url.search = new URLSearchParams({
        client_id: requireEnv("META_APP_ID"),
        redirect_uri: redirectUri,
        state,
        scope:
          "public_profile,email,pages_show_list,pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish",
        response_type: "code",
      }).toString();
      return url.href;
    },
    async exchange({ code, redirectUri, targetExternalId }) {
      const url = new URL(metaGraphBase() + "/oauth/access_token");
      url.search = new URLSearchParams({
        client_id: requireEnv("META_APP_ID"),
        client_secret: requireEnv("META_APP_SECRET"),
        redirect_uri: redirectUri,
        code,
      }).toString();
      const tokens = parseOAuthTokens(await exchangeJson(url));
      const pageSchema = z.object({
        id,
        name: label.optional(),
        access_token: z.string().optional(),
        instagram_business_account: z
          .object({ id: id.optional(), username: label.optional() })
          .optional(),
      });
      const resultSchema = z.object({
        data: z.array(pageSchema).default([]),
        paging: z
          .object({
            next: z.string().optional(),
            cursors: z.object({ after: pageTokenSchema.optional() }).optional(),
          })
          .optional(),
      });
      const eligible: Array<z.output<typeof pageSchema>> = [];
      const seen = new Set<string>();
      const deadline = AbortSignal.timeout(40_000);
      let after: string | undefined;
      do {
        const pagesUrl = new URL(metaGraphBase() + "/me/accounts");
        pagesUrl.searchParams.set(
          "fields",
          "id,name,access_token,instagram_business_account{id,username}",
        );
        pagesUrl.searchParams.set("limit", "100");
        if (after) pagesUrl.searchParams.set("after", after);
        const result = await authorizedJson(resultSchema, pagesUrl, tokens.accessToken, deadline);
        eligible.push(
          ...result.data.filter(
            (page) =>
              validToken(page.access_token) &&
              (platform === "facebook" || page.instagram_business_account?.id),
          ),
        );
        // Never follow a provider-supplied next URL with an Authorization header.
        after = result.paging?.next ? result.paging.cursors?.after : undefined;
        if (result.paging?.next && !after)
          throw new ProviderConnectionError("account_selection_required");
        if (after && (seen.has(after) || seen.size >= 20))
          throw new ProviderConnectionError("account_selection_required");
        if (after) seen.add(after);
      } while (after);
      const unique = [...new Map(eligible.map((page) => [page.id, page])).values()];
      const accountId = (page: z.output<typeof pageSchema>) =>
        platform === "instagram" ? page.instagram_business_account!.id : page.id;
      if (!targetExternalId && unique.length > 1)
        throw new ProviderConnectionError("account_selection_required");
      const page = targetExternalId
        ? unique.find((value) => accountId(value) === targetExternalId)
        : unique[0];
      if (!page) throw new ProviderConnectionError("no_eligible_account");
      return {
        accessToken: page.access_token!,
        tokenType: tokens.tokenType,
        expiresAt: tokens.expiresAt,
        externalAccountId: accountId(page),
        externalHandle:
          platform === "instagram" ? page.instagram_business_account?.username : page.name,
        metadata: {
          page_id: page.id,
          ...(platform === "instagram" ? { ig_user_id: page.instagram_business_account!.id! } : {}),
        },
      };
    },
  };
}
const meta = metaProvider("facebook");
const linkedin: Provider = {
  platform: "linkedin",
  authUrl({ state, redirectUri }) {
    const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: requireEnv("LINKEDIN_CLIENT_ID"),
      redirect_uri: redirectUri,
      state,
      scope: "openid profile email w_member_social",
    }).toString();
    return url.href;
  },
  async exchange({ code, redirectUri }) {
    const json = await exchangeJson(
      "https://www.linkedin.com/oauth/v2/accessToken",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: requireEnv("LINKEDIN_CLIENT_ID"),
        client_secret: requireEnv("LINKEDIN_CLIENT_SECRET"),
      }),
    );
    const tokens = parseOAuthTokens(json, { expiryRequired: true });
    const profile = await authorizedJson(
      z.object({ sub: id, name: label.optional() }),
      "https://api.linkedin.com/v2/userinfo",
      tokens.accessToken,
    );
    return {
      ...tokens,
      externalAccountId: profile.sub,
      externalHandle: profile.name,
      metadata: { person_id: profile.sub },
    };
  },
};
const google: Provider = {
  platform: "youtube",
  authUrl: ({ state, redirectUri }) =>
    googleAuthUrl(
      "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
      state,
      redirectUri,
    ),
  async exchange(args): Promise<ProviderTokens> {
    const tokens = await googleExchange(args);
    const channels = await authorizedJson(
      z.object({
        items: z
          .array(z.object({ id, snippet: z.object({ title: label.optional() }).optional() }))
          .default([]),
        nextPageToken: pageTokenSchema.optional(),
      }),
      "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true",
      tokens.accessToken,
    );
    if (channels.nextPageToken || (!args.targetExternalId && channels.items.length > 1))
      throw new ProviderConnectionError("account_selection_required");
    const channel = args.targetExternalId
      ? channels.items.find((item) => item.id === args.targetExternalId)
      : channels.items[0];
    if (!channel) throw new ProviderConnectionError("no_eligible_account");
    return { ...tokens, externalAccountId: channel.id, externalHandle: channel.snippet?.title };
  },
};
const googleBusiness: Provider = {
  platform: "google_business",
  authUrl: ({ state, redirectUri }) =>
    googleAuthUrl("https://www.googleapis.com/auth/business.manage", state, redirectUri),
  async exchange(args): Promise<ProviderTokens> {
    const tokens = await googleExchange(args);
    const locations = await listBusinessLocations(tokens.accessToken);
    if (!locations.length) throw new ProviderConnectionError("no_eligible_account");
    if (args.targetExternalId?.includes("/locations/")) {
      const chosen = locations.find((location) => location.name === args.targetExternalId);
      if (!chosen?.verified) throw new ProviderConnectionError("no_eligible_account");
      return {
        ...tokens,
        externalAccountId: chosen.name,
        externalHandle: chosen.locationName,
        metadata: {
          requires_location_selection: false,
          location_confirmed: true,
          account_id: chosen.accountId,
          location_id: chosen.locationId,
          location_name: chosen.locationName,
          address: chosen.address ?? null,
        },
      };
    }
    const accounts = [...new Set(locations.map((location) => `accounts/${location.accountId}`))];
    if (!args.targetExternalId && accounts.length > 1)
      throw new ProviderConnectionError("account_selection_required");
    const account = args.targetExternalId
      ? accounts.find((value) => value === args.targetExternalId)
      : accounts[0];
    if (!account) throw new ProviderConnectionError("no_eligible_account");
    return {
      ...tokens,
      externalAccountId: account,
      externalHandle: "Google Business — selecione uma unidade",
      metadata: { requires_location_selection: true, location_confirmed: false },
    };
  },
};

export interface BusinessLocation {
  name: string;
  accountId: string;
  locationId: string;
  locationName: string;
  address?: string;
  /** Current Voice of Merchant, not a guessed historical verification flag. */
  verified: boolean;
}
async function discoverBusinessLocations(accessToken: string): Promise<BusinessLocation[]> {
  const accounts: string[] = [];
  const deadline = AbortSignal.timeout(40_000);
  let pageToken: string | undefined;
  let seen = new Set<string>();
  const next = (value: string | undefined) => {
    if (value && (seen.has(value) || seen.size >= 100))
      throw new ProviderConnectionError("provider_unavailable");
    if (value) seen.add(value);
    return value;
  };
  do {
    const url = new URL("https://mybusinessaccountmanagement.googleapis.com/v1/accounts");
    url.searchParams.set("pageSize", "20");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = await authorizedJson(
      z.object({
        accounts: z.array(z.object({ name: z.string().regex(/^accounts\/[0-9]+$/) })).default([]),
        nextPageToken: pageTokenSchema.optional(),
      }),
      url,
      accessToken,
      deadline,
    );
    accounts.push(...page.accounts.map((account) => account.name));
    pageToken = next(page.nextPageToken);
    if (accounts.length > 2000) throw new ProviderConnectionError("account_selection_required");
  } while (pageToken);
  const out = new Map<string, BusinessLocation>();
  for (const account of new Set(accounts)) {
    pageToken = undefined;
    seen = new Set();
    do {
      const url = new URL(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${account}/locations`,
      );
      url.searchParams.set("readMask", "name,title,storefrontAddress");
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const page = await authorizedJson(
        z.object({
          locations: z
            .array(
              z.object({
                name: z.string().regex(/^locations\/[0-9]+$/),
                title: label.optional(),
                storefrontAddress: z
                  .object({
                    addressLines: z.array(label).optional(),
                    locality: label.optional(),
                    regionCode: z.string().max(10).optional(),
                  })
                  .optional(),
              }),
            )
            .default([]),
          nextPageToken: pageTokenSchema.optional(),
        }),
        url,
        accessToken,
        deadline,
      );
      for (const location of page.locations) {
        const state = await authorizedJson(
          z.object({ hasVoiceOfMerchant: z.boolean().optional() }),
          `https://mybusinessverifications.googleapis.com/v1/${location.name}/VoiceOfMerchantState`,
          accessToken,
          deadline,
        );
        const locationId = location.name.split("/")[1];
        const address = location.storefrontAddress;
        const name = `${account}/locations/${locationId}`;
        out.set(name, {
          name,
          accountId: account.split("/")[1],
          locationId,
          locationName: location.title ?? `Location ${locationId}`,
          verified: state.hasVoiceOfMerchant === true,
          address: [address?.addressLines?.join(", "), address?.locality, address?.regionCode]
            .filter(Boolean)
            .join(" · "),
        });
        if (out.size > 2000) throw new ProviderConnectionError("account_selection_required");
      }
      pageToken = next(page.nextPageToken);
    } while (pageToken);
  }
  return [...out.values()];
}
export async function listBusinessLocations(accessToken: string): Promise<BusinessLocation[]> {
  try {
    return await discoverBusinessLocations(accessToken);
  } catch (error) {
    if (error instanceof ProviderConnectionError) throw error;
    throw new ProviderConnectionError("provider_unavailable");
  }
}
const tiktok: Provider = {
  platform: "tiktok",
  authUrl({ state, redirectUri }) {
    const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
    url.search = new URLSearchParams({
      client_key: requireEnv("TIKTOK_CLIENT_KEY"),
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      scope: "user.info.basic,video.upload,video.publish",
    }).toString();
    return url.href;
  },
  async exchange({ code, redirectUri }) {
    const json = await exchangeJson(
      "https://open.tiktokapis.com/v2/oauth/token/",
      new URLSearchParams({
        client_key: requireEnv("TIKTOK_CLIENT_KEY"),
        client_secret: requireEnv("TIKTOK_CLIENT_SECRET"),
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    );
    const tokens = parseOAuthTokens(json, { expiryRequired: true });
    return { ...tokens, externalAccountId: parse(id, json.open_id) };
  },
};
export type SupportedProvider =
  | "meta"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "google"
  | "youtube"
  | "google_business"
  | "tiktok";
const REGISTRY: Record<SupportedProvider, Provider> = {
  meta,
  facebook: meta,
  instagram: metaProvider("instagram"),
  linkedin,
  google,
  youtube: google,
  google_business: googleBusiness,
  tiktok,
};
export function getProvider(name: string): Provider {
  const provider = Object.hasOwn(REGISTRY, name) ? REGISTRY[name as SupportedProvider] : undefined;
  if (!provider) throw new Error("Unsupported OAuth provider");
  return {
    ...provider,
    exchange: async (args) => {
      try {
        return await provider.exchange(args);
      } catch (error) {
        if (error instanceof ProviderConnectionError) throw error;
        throw new ProviderConnectionError("provider_unavailable");
      }
    },
  };
}
export function listProviders(): SupportedProvider[] {
  return Object.keys(REGISTRY) as SupportedProvider[];
}
