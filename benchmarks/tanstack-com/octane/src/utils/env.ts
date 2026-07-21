import * as v from 'valibot';

// Define server-only schema
const serverEnvSchema = v.object({
	GITHUB_AUTH_TOKEN: v.optional(v.string(), 'USE_A_REAL_KEY_IN_PRODUCTION'),
	GITHUB_WEBHOOK_SECRET: v.optional(v.string()),
	GITHUB_OAUTH_CLIENT_ID: v.optional(v.string()),
	GITHUB_OAUTH_CLIENT_SECRET: v.optional(v.string()),
	GOOGLE_OAUTH_CLIENT_ID: v.optional(v.string()),
	GOOGLE_OAUTH_CLIENT_SECRET: v.optional(v.string()),
	DATABASE_URL: v.optional(v.string()),
	SESSION_SECRET: v.optional(v.string()), // Secret key for signing session cookies (required in production)
	DISCORD_WEBHOOK_URL: v.optional(v.string()),
	RESEND_API_KEY: v.optional(v.string()),
	SENTRY_DSN: v.optional(v.string()),
	TANSTACK_MCP_ENABLED_TOOLS: v.optional(v.string()),
	TANSTACK_LOCAL_REPOS_DIR: v.optional(v.string()),
	// Shopify Storefront API token — server-only. Cart reads and mutations
	// run through createServerFn (src/utils/shop.functions.ts), so this
	// token never reaches the browser. Store domain + API version are
	// public-by-design and hard-coded in src/server/shopify/fetch.ts.
	SHOPIFY_PRIVATE_STOREFRONT_TOKEN: v.optional(v.string()),
});

const clientEnvSchema = v.object({
	VITE_KAPA_INTEGRATION_ID: v.optional(v.string()),
	VITE_KAPA_SOURCE_GROUP_IDS: v.optional(v.string()),
});

// Validate and parse environment variables
const viteEnv = import.meta.env ?? {};

const parsedServerEnv = viteEnv.SSR ? v.parse(serverEnvSchema, process.env) : {};

const parsedClientEnv = v.parse(clientEnvSchema, viteEnv);

type ParsedServerEnv = v.InferOutput<typeof serverEnvSchema>;
type ParsedClientEnv = v.InferOutput<typeof clientEnvSchema>;
type ParsedEnv = ParsedServerEnv & ParsedClientEnv;

// Merge parsed environments, with server env hidden from client
export const env = new Proxy(
	viteEnv.SSR ? { ...parsedClientEnv, ...parsedServerEnv } : parsedClientEnv,
	{
		get(target, prop) {
			if (prop in parsedServerEnv && typeof window !== 'undefined') {
				throw new Error(
					`Access to server-only environment variable '${String(
						prop,
					)}' from client code is not allowed.`,
				);
			}
			return prop in parsedServerEnv
				? parsedServerEnv[prop as keyof typeof parsedServerEnv]
				: target[prop as keyof typeof parsedClientEnv];
		},
	},
) as ParsedEnv;
