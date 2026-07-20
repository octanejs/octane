import { env } from '~/utils/env';

/**
 * Shopify store identity. Hard-coded intentionally — these are public-by-
 * design values (they appear in every Shopify-hosted checkout URL, order
 * email, and receipt) and baking them into source keeps them out of the
 * environment-variable scanner's watchlist without losing any security.
 *
 * Only the tokens are real secrets and remain in env vars.
 */
const SHOPIFY_STORE_DOMAIN = 'tanstack-2.myshopify.com';
const SHOPIFY_API_VERSION = '2026-01';

type ShopifyFetchInput<TVariables> = {
	query: string;
	variables?: TVariables;
	/**
	 * Optional buyer IP, forwarded to Shopify's bot-protection headers.
	 * Only meaningful with the private token.
	 */
	buyerIp?: string;
};

type ShopifyResponse<TData> = {
	data?: TData;
	errors?: Array<{ message: string; locations?: unknown; path?: unknown }>;
};

class ShopifyError extends Error {
	constructor(
		message: string,
		public readonly errors?: ShopifyResponse<unknown>['errors'],
	) {
		super(message);
		this.name = 'ShopifyError';
	}
}

/**
 * Server-side Storefront API client. Uses the private access token, which has
 * higher rate limits and supports buyer-IP forwarding for bot protection.
 *
 * Use this in route loaders and server functions only — never in browser code.
 */
export async function shopifyServerFetch<TData, TVariables = Record<string, unknown>>(
	input: ShopifyFetchInput<TVariables>,
): Promise<TData> {
	const token = env.SHOPIFY_PRIVATE_STOREFRONT_TOKEN;

	if (!token) {
		throw new ShopifyError(
			'Shopify server client is not configured. Set SHOPIFY_PRIVATE_STOREFRONT_TOKEN in the environment.',
		);
	}

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'application/json',
		'Shopify-Storefront-Private-Token': token,
	};
	if (input.buyerIp) headers['Shopify-Storefront-Buyer-IP'] = input.buyerIp;

	const response = await fetch(
		`https://${SHOPIFY_STORE_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`,
		{
			method: 'POST',
			headers,
			body: JSON.stringify({ query: input.query, variables: input.variables }),
		},
	);

	if (!response.ok) {
		throw new ShopifyError(`Shopify API error: ${response.status} ${response.statusText}`);
	}

	const json = (await response.json()) as ShopifyResponse<TData>;

	if (json.errors?.length) {
		throw new ShopifyError(json.errors.map((e) => e.message).join('\n'), json.errors);
	}

	if (!json.data) {
		throw new ShopifyError('Shopify API returned no data and no errors.');
	}

	return json.data;
}
