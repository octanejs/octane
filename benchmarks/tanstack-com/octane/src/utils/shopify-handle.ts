import * as v from 'valibot';

const shopifyHandlePattern = /^[^\s/?#]+$/u;

export const shopifyHandleSchema = v.pipe(
	v.string(),
	v.minLength(1),
	v.maxLength(255),
	v.regex(shopifyHandlePattern),
);
