// Bench delta: upstream (shop.functions.upstream.ts.txt) talks to the Shopify
// Storefront API. Shop routes are outside the benchmark surface, but the
// Navbar's merch preview and cart button reach these fns, so they answer as
// an empty storefront: no products, no cart (upstream's cookie-less state),
// and mutations fail as unavailable.
import { createServerFn } from '@octanejs/tanstack-start';
import type { ProductListPage } from '~/utils/shopify-queries';

const SHOP_DISABLED_ERROR = 'The shop is disabled in the benchmark build';

const EMPTY_PAGE: ProductListPage = {
	nodes: [],
	pageInfo: { hasNextPage: false, endCursor: null },
};

export const getShop = createServerFn({ method: 'GET' }).handler(async () => null);

export const getProducts = createServerFn({ method: 'POST' })
	.validator((data: unknown) => data)
	.handler(async (): Promise<ProductListPage> => EMPTY_PAGE);

export const getCollections = createServerFn({ method: 'GET' }).handler(async () => []);

export const getProduct = createServerFn({ method: 'POST' })
	.validator((data: unknown) => data)
	.handler(async () => null);

export const getCollection = createServerFn({ method: 'POST' })
	.validator((data: unknown) => data)
	.handler(async () => null);

export const getPage = createServerFn({ method: 'POST' })
	.validator((data: unknown) => data)
	.handler(async () => null);

export const getShopPolicies = createServerFn({ method: 'GET' }).handler(async () => []);

export const getShopPolicy = createServerFn({ method: 'POST' })
	.validator((data: unknown) => data)
	.handler(async () => null);

export const searchProducts = createServerFn({ method: 'POST' })
	.validator((data: unknown) => data)
	.handler(async (): Promise<ProductListPage> => EMPTY_PAGE);

export const getCart = createServerFn({ method: 'GET' }).handler(async () => null);

export const addToCart = createServerFn({ method: 'POST' })
	.validator((data: unknown) => data)
	.handler(async () => {
		throw new Error(SHOP_DISABLED_ERROR);
	});

export const updateCartLine = createServerFn({ method: 'POST' })
	.validator((data: unknown) => data)
	.handler(async () => {
		throw new Error(SHOP_DISABLED_ERROR);
	});

export const removeCartLine = createServerFn({ method: 'POST' })
	.validator((data: unknown) => data)
	.handler(async () => {
		throw new Error(SHOP_DISABLED_ERROR);
	});

export const applyDiscountCode = createServerFn({ method: 'POST' })
	.validator((data: unknown) => data)
	.handler(async () => {
		throw new Error(SHOP_DISABLED_ERROR);
	});

export const removeDiscountCode = createServerFn({ method: 'POST' }).handler(async () => {
	throw new Error(SHOP_DISABLED_ERROR);
});
