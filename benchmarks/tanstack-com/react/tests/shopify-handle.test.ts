import assert from 'node:assert/strict';
import * as v from 'valibot';
import { shopifyHandleSchema } from '../src/utils/shopify-handle';

for (const handle of [
	'3d-relax-snap-iphone®-case',
	'clear-case-for-iphone®',
	'tanstack-magsafe®-clear-case-for-iphone®',
]) {
	assert.equal(
		v.safeParse(shopifyHandleSchema, handle).success,
		true,
		`Shopify handle ${handle} is accepted`,
	);
}

for (const handle of ['products/foo', 'foo?bar=baz', 'foo#details', 'foo bar']) {
	assert.equal(
		v.safeParse(shopifyHandleSchema, handle).success,
		false,
		`invalid handle ${handle} is rejected`,
	);
}

console.log('shopify-handle tests passed');
