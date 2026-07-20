import assert from 'node:assert/strict';
import * as v from 'valibot';
import { shopifyCartLineIdSchema, shopifyProductVariantIdSchema } from '../src/utils/shopify-id';

assert.equal(
	v.safeParse(
		shopifyCartLineIdSchema,
		'gid://shopify/CartLine/cb211b52-6820-4519-831c-d87e1e7b7caf?cart=hWNDlJI3U21JDjTXJhpZBI01',
	).success,
	true,
	'cart line IDs with Shopify cart suffixes are accepted',
);

assert.equal(
	v.safeParse(shopifyCartLineIdSchema, 'gid://shopify/ProductVariant/123').success,
	false,
	'cart line schema rejects other Shopify resource types',
);

assert.equal(
	v.safeParse(shopifyProductVariantIdSchema, 'gid://shopify/ProductVariant/123').success,
	true,
	'product variant IDs are accepted',
);

assert.equal(
	v.safeParse(shopifyProductVariantIdSchema, 'gid://shopify/CartLine/1?cart=abc').success,
	false,
	'product variant schema rejects cart line IDs',
);

console.log('shopify-id tests passed');
