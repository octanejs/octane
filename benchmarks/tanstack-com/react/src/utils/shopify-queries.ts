import type {
	Cart,
	CartLine,
	Collection,
	Image as StorefrontImage,
	MoneyV2,
	Page,
	Product,
	ProductOption,
	ProductSortKeys,
	ProductVariant,
} from '@shopify/hydrogen-react/storefront-api-types';

/**
 * GraphQL queries for the Shopify Storefront API.
 *
 * Result types are hand-picked slices of the full `@shopify/hydrogen-react`
 * Storefront API types. When the query count grows we can swap to
 * `@shopify/hydrogen-codegen` and regenerate; the consuming code won't
 * change because the type shapes match exactly.
 */

/* ──────────────────────────────────────────────────────────────────────────
 * Shop info — used by the smoke test and the shop landing header
 * ────────────────────────────────────────────────────────────────────────── */

export const SHOP_QUERY = /* GraphQL */ `
	query Shop {
		shop {
			name
			description
			primaryDomain {
				url
			}
		}
	}
`;

export type ShopQueryResult = {
	shop: {
		name: string;
		description: string | null;
		primaryDomain: { url: string };
	};
};

/* ──────────────────────────────────────────────────────────────────────────
 * Product list — used by /shop landing
 * ────────────────────────────────────────────────────────────────────────── */

const PRODUCT_CARD_FRAGMENT = /* GraphQL */ `
	fragment ProductCard on Product {
		id
		handle
		title
		productType
		tags
		publishedAt
		options {
			name
			values
		}
		featuredImage {
			url
			altText
			width
			height
		}
		variants(first: 10) {
			nodes {
				selectedOptions {
					name
					value
				}
				image {
					url
					altText
					width
					height
				}
			}
		}
		priceRange {
			minVariantPrice {
				amount
				currencyCode
			}
			maxVariantPrice {
				amount
				currencyCode
			}
		}
		compareAtPriceRange {
			minVariantPrice {
				amount
				currencyCode
			}
		}
	}
`;

export const PRODUCTS_QUERY = /* GraphQL */ `
	${PRODUCT_CARD_FRAGMENT}
	query Products($first: Int!, $after: String, $sortKey: ProductSortKeys, $reverse: Boolean) {
		products(first: $first, after: $after, sortKey: $sortKey, reverse: $reverse) {
			pageInfo {
				hasNextPage
				endCursor
			}
			nodes {
				...ProductCard
			}
		}
	}
`;

type CardVariantImage = Pick<StorefrontImage, 'url' | 'altText' | 'width' | 'height'> | null;

export type ProductListItem = Pick<
	Product,
	'id' | 'handle' | 'title' | 'productType' | 'tags' | 'publishedAt'
> & {
	options: Array<Pick<ProductOption, 'name' | 'values'>>;
	featuredImage: CardVariantImage | null;
	variants: {
		nodes: Array<{
			selectedOptions: Array<{ name: string; value: string }>;
			image: CardVariantImage;
		}>;
	};
	priceRange: {
		minVariantPrice: Pick<MoneyV2, 'amount' | 'currencyCode'>;
		maxVariantPrice: Pick<MoneyV2, 'amount' | 'currencyCode'>;
	};
	compareAtPriceRange: {
		minVariantPrice: Pick<MoneyV2, 'amount' | 'currencyCode'>;
	};
};

export type ProductListPage = {
	nodes: Array<ProductListItem>;
	pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

export type ProductsQueryVariables = {
	first: number;
	after?: string | null;
	sortKey?: ProductSortKeys | null;
	reverse?: boolean | null;
};

export const SORT_OPTIONS = [
	{ key: 'BEST_SELLING', reverse: false, label: 'Best selling' },
	{ key: 'CREATED_AT', reverse: true, label: 'Newest' },
	{ key: 'PRICE', reverse: false, label: 'Price: low to high' },
	{ key: 'PRICE', reverse: true, label: 'Price: high to low' },
	{ key: 'TITLE', reverse: false, label: 'Title: A–Z' },
] as const satisfies ReadonlyArray<{
	key: ProductSortKeys;
	reverse: boolean;
	label: string;
}>;

export type SortOption = (typeof SORT_OPTIONS)[number];
export type SortOptionId = `${SortOption['key']}${'' | ':rev'}`;

export function sortOptionId(opt: SortOption): SortOptionId {
	return (opt.reverse ? `${opt.key}:rev` : opt.key) as SortOptionId;
}

export function resolveSortOption(id: string | undefined): SortOption {
	if (!id) return SORT_OPTIONS[0];
	for (const opt of SORT_OPTIONS) {
		if (sortOptionId(opt) === id) return opt;
	}
	return SORT_OPTIONS[0];
}

export type ProductsQueryResult = {
	products: ProductListPage;
};

/* ──────────────────────────────────────────────────────────────────────────
 * Single product (PDP) — used by /shop/products/$handle
 * ────────────────────────────────────────────────────────────────────────── */

export const PRODUCT_QUERY = /* GraphQL */ `
	query Product($handle: String!) {
		product(handle: $handle) {
			id
			handle
			title
			descriptionHtml
			options {
				id
				name
				values
			}
			images(first: 10) {
				nodes {
					url
					altText
					width
					height
				}
			}
			variants(first: 100) {
				nodes {
					id
					title
					availableForSale
					selectedOptions {
						name
						value
					}
					price {
						amount
						currencyCode
					}
					image {
						url
						altText
						width
						height
					}
				}
			}
			seo {
				title
				description
			}
		}
	}
`;

export type ProductDetailVariant = Pick<ProductVariant, 'id' | 'title' | 'availableForSale'> & {
	selectedOptions: Array<{ name: string; value: string }>;
	price: Pick<MoneyV2, 'amount' | 'currencyCode'>;
	image: Pick<StorefrontImage, 'url' | 'altText' | 'width' | 'height'> | null;
};

export type ProductDetail = Pick<Product, 'id' | 'handle' | 'title' | 'descriptionHtml'> & {
	options: Array<Pick<ProductOption, 'id' | 'name' | 'values'>>;
	images: {
		nodes: Array<Pick<StorefrontImage, 'url' | 'altText' | 'width' | 'height'>>;
	};
	variants: { nodes: Array<ProductDetailVariant> };
	seo: { title: string | null; description: string | null };
};

export type ProductQueryResult = {
	product: ProductDetail | null;
};

/* ──────────────────────────────────────────────────────────────────────────
 * Collections list — used to drive the /shop sidebar
 * ────────────────────────────────────────────────────────────────────────── */

export const COLLECTIONS_QUERY = /* GraphQL */ `
	query Collections($first: Int!) {
		collections(first: $first, sortKey: TITLE) {
			nodes {
				id
				handle
				title
				description
			}
		}
	}
`;

export type CollectionListItem = Pick<Collection, 'id' | 'handle' | 'title' | 'description'>;

export type CollectionsQueryResult = {
	collections: { nodes: Array<CollectionListItem> };
};

/* ──────────────────────────────────────────────────────────────────────────
 * Cart — queries + mutations
 *
 * The cart lives in Shopify. We hit the Storefront API directly from the
 * browser with the public token (no server hop needed), and manage the cart
 * ID client-side via localStorage. Checkout redirects to `cart.checkoutUrl`
 * which is Shopify-hosted.
 * ────────────────────────────────────────────────────────────────────────── */

const CART_FRAGMENT = /* GraphQL */ `
	fragment CartFields on Cart {
		id
		checkoutUrl
		totalQuantity
		cost {
			totalAmount {
				amount
				currencyCode
			}
			subtotalAmount {
				amount
				currencyCode
			}
			totalTaxAmount {
				amount
				currencyCode
			}
		}
		lines(first: 100) {
			nodes {
				id
				quantity
				merchandise {
					... on ProductVariant {
						id
						title
						availableForSale
						selectedOptions {
							name
							value
						}
						price {
							amount
							currencyCode
						}
						image {
							url
							altText
							width
							height
						}
						product {
							handle
							title
						}
					}
				}
				cost {
					totalAmount {
						amount
						currencyCode
					}
				}
			}
		}
		discountCodes {
			code
			applicable
		}
	}
`;

export const CART_QUERY = /* GraphQL */ `
	${CART_FRAGMENT}
	query Cart($cartId: ID!) {
		cart(id: $cartId) {
			...CartFields
		}
	}
`;

export const CART_CREATE_MUTATION = /* GraphQL */ `
	${CART_FRAGMENT}
	mutation CartCreate($input: CartInput!) {
		cartCreate(input: $input) {
			cart {
				...CartFields
			}
			userErrors {
				field
				message
			}
		}
	}
`;

export const CART_LINES_ADD_MUTATION = /* GraphQL */ `
	${CART_FRAGMENT}
	mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
		cartLinesAdd(cartId: $cartId, lines: $lines) {
			cart {
				...CartFields
			}
			userErrors {
				field
				message
			}
		}
	}
`;

export const CART_LINES_UPDATE_MUTATION = /* GraphQL */ `
	${CART_FRAGMENT}
	mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
		cartLinesUpdate(cartId: $cartId, lines: $lines) {
			cart {
				...CartFields
			}
			userErrors {
				field
				message
			}
		}
	}
`;

export const CART_LINES_REMOVE_MUTATION = /* GraphQL */ `
	${CART_FRAGMENT}
	mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
		cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
			cart {
				...CartFields
			}
			userErrors {
				field
				message
			}
		}
	}
`;

export type CartLineMerchandise = Pick<ProductVariant, 'id' | 'title' | 'availableForSale'> & {
	selectedOptions: Array<{ name: string; value: string }>;
	price: Pick<MoneyV2, 'amount' | 'currencyCode'>;
	image: Pick<StorefrontImage, 'url' | 'altText' | 'width' | 'height'> | null;
	product: Pick<Product, 'handle' | 'title'>;
};

export type CartLineDetail = Pick<CartLine, 'id' | 'quantity'> & {
	merchandise: CartLineMerchandise;
	cost: {
		totalAmount: Pick<MoneyV2, 'amount' | 'currencyCode'>;
	};
};

export type CartDetail = Pick<Cart, 'id' | 'checkoutUrl' | 'totalQuantity'> & {
	cost: {
		totalAmount: Pick<MoneyV2, 'amount' | 'currencyCode'>;
		subtotalAmount: Pick<MoneyV2, 'amount' | 'currencyCode'>;
		totalTaxAmount: Pick<MoneyV2, 'amount' | 'currencyCode'> | null;
	};
	lines: { nodes: Array<CartLineDetail> };
	discountCodes: Array<{ code: string; applicable: boolean }>;
};

export type CartQueryResult = {
	cart: CartDetail | null;
};

export type CartUserError = { field: string[] | null; message: string };

export type CartCreateResult = {
	cartCreate: { cart: CartDetail | null; userErrors: Array<CartUserError> };
};

export type CartLinesAddResult = {
	cartLinesAdd: { cart: CartDetail | null; userErrors: Array<CartUserError> };
};

export type CartLinesUpdateResult = {
	cartLinesUpdate: {
		cart: CartDetail | null;
		userErrors: Array<CartUserError>;
	};
};

export type CartLinesRemoveResult = {
	cartLinesRemove: {
		cart: CartDetail | null;
		userErrors: Array<CartUserError>;
	};
};

export const CART_DISCOUNT_CODES_UPDATE_MUTATION = /* GraphQL */ `
	${CART_FRAGMENT}
	mutation CartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]) {
		cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
			cart {
				...CartFields
			}
			userErrors {
				field
				message
			}
		}
	}
`;

export type CartDiscountCodesUpdateResult = {
	cartDiscountCodesUpdate: {
		cart: CartDetail | null;
		userErrors: Array<CartUserError>;
	};
};

/* ──────────────────────────────────────────────────────────────────────────
 * Collection (by handle) — backs /shop/collections/$handle
 * ────────────────────────────────────────────────────────────────────────── */

export const COLLECTION_QUERY = /* GraphQL */ `
	${PRODUCT_CARD_FRAGMENT}
	query Collection(
		$handle: String!
		$first: Int!
		$after: String
		$sortKey: ProductCollectionSortKeys
		$reverse: Boolean
	) {
		collection(handle: $handle) {
			id
			handle
			title
			description
			descriptionHtml
			image {
				url
				altText
				width
				height
			}
			seo {
				title
				description
			}
			products(first: $first, after: $after, sortKey: $sortKey, reverse: $reverse) {
				pageInfo {
					hasNextPage
					endCursor
				}
				nodes {
					...ProductCard
				}
			}
		}
	}
`;

export type CollectionDetail = Pick<
	Collection,
	'id' | 'handle' | 'title' | 'description' | 'descriptionHtml'
> & {
	image: Pick<StorefrontImage, 'url' | 'altText' | 'width' | 'height'> | null;
	seo: { title: string | null; description: string | null };
	products: ProductListPage;
};

export type CollectionQueryResult = {
	collection: CollectionDetail | null;
};

export const COLLECTION_SORT_OPTIONS = [
	{ key: 'COLLECTION_DEFAULT', reverse: false, label: 'Featured' },
	{ key: 'BEST_SELLING', reverse: false, label: 'Best selling' },
	{ key: 'CREATED', reverse: true, label: 'Newest' },
	{ key: 'PRICE', reverse: false, label: 'Price: low to high' },
	{ key: 'PRICE', reverse: true, label: 'Price: high to low' },
	{ key: 'TITLE', reverse: false, label: 'Title: A–Z' },
] as const satisfies ReadonlyArray<{
	key: string;
	reverse: boolean;
	label: string;
}>;

export type CollectionSortOption = (typeof COLLECTION_SORT_OPTIONS)[number];
export type CollectionSortOptionId = `${CollectionSortOption['key']}${'' | ':rev'}`;

export function collectionSortOptionId(opt: CollectionSortOption): CollectionSortOptionId {
	return (opt.reverse ? `${opt.key}:rev` : opt.key) as CollectionSortOptionId;
}

export function resolveCollectionSortOption(id: string | undefined): CollectionSortOption {
	if (!id) return COLLECTION_SORT_OPTIONS[0];
	for (const opt of COLLECTION_SORT_OPTIONS) {
		if (collectionSortOptionId(opt) === id) return opt;
	}
	return COLLECTION_SORT_OPTIONS[0];
}

/* ──────────────────────────────────────────────────────────────────────────
 * Shopify Pages (policies, about, etc) — backs /shop/pages/$handle
 * ────────────────────────────────────────────────────────────────────────── */

export const PAGE_QUERY = /* GraphQL */ `
	query Page($handle: String!) {
		page(handle: $handle) {
			id
			handle
			title
			body
			bodySummary
			seo {
				title
				description
			}
		}
	}
`;

export type PageDetail = Pick<Page, 'id' | 'handle' | 'title' | 'body' | 'bodySummary'> & {
	seo: { title: string | null; description: string | null };
};

export type PageQueryResult = {
	page: PageDetail | null;
};

/* ──────────────────────────────────────────────────────────────────────────
 * Shop policies — Privacy, Refund, Terms, Shipping
 *
 * Shopify stores policies separately from generic pages. They're accessed
 * via top-level fields on `shop`, not the `page(handle:)` query.
 * ────────────────────────────────────────────────────────────────────────── */

export const SHOP_POLICIES_QUERY = /* GraphQL */ `
	query ShopPolicies {
		shop {
			privacyPolicy {
				handle
				title
				body
			}
			refundPolicy {
				handle
				title
				body
			}
			termsOfService {
				handle
				title
				body
			}
			shippingPolicy {
				handle
				title
				body
			}
		}
	}
`;

export type ShopPolicy = {
	handle: string;
	title: string;
	body: string;
} | null;

export type ShopPoliciesQueryResult = {
	shop: {
		privacyPolicy: ShopPolicy;
		refundPolicy: ShopPolicy;
		termsOfService: ShopPolicy;
		shippingPolicy: ShopPolicy;
	};
};

export type PolicySummary = { handle: string; title: string };

/**
 * Flatten the four policy fields into a list of non-null policies,
 * suitable for rendering sidebar links.
 */
export function flattenPolicies(shop: ShopPoliciesQueryResult['shop']): Array<PolicySummary> {
	const keys = ['shippingPolicy', 'refundPolicy', 'privacyPolicy', 'termsOfService'] as const;
	return keys.flatMap((k) => {
		const p = shop[k];
		return p ? [{ handle: p.handle, title: p.title }] : [];
	});
}

/* ──────────────────────────────────────────────────────────────────────────
 * Search — backs /shop/search
 * ────────────────────────────────────────────────────────────────────────── */

export const SEARCH_QUERY = /* GraphQL */ `
	${PRODUCT_CARD_FRAGMENT}
	query Search($query: String!, $first: Int!, $after: String) {
		search(
			query: $query
			first: $first
			after: $after
			types: [PRODUCT]
			productFilters: [{ available: true }]
		) {
			totalCount
			pageInfo {
				hasNextPage
				endCursor
			}
			nodes {
				... on Product {
					...ProductCard
				}
			}
		}
	}
`;

export type SearchQueryResult = {
	search: {
		totalCount: number;
		pageInfo: { hasNextPage: boolean; endCursor: string | null };
		nodes: Array<ProductListItem>;
	};
};
