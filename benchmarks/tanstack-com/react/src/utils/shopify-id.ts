import * as v from 'valibot';

const shopifyProductVariantIdPattern = /^gid:\/\/shopify\/ProductVariant\/\S+$/;
const shopifyCartLineIdPattern = /^gid:\/\/shopify\/CartLine\/\S+$/;

export const shopifyProductVariantIdSchema = v.pipe(
	v.string(),
	v.minLength(1),
	v.maxLength(512),
	v.regex(shopifyProductVariantIdPattern),
);

export const shopifyCartLineIdSchema = v.pipe(
	v.string(),
	v.minLength(1),
	v.maxLength(512),
	v.regex(shopifyCartLineIdPattern),
);
