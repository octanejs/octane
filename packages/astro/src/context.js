/**
 * Per-SSR-result island id counter — seeds Octane `useId` via `identifierPrefix`
 * so multiple islands on one page do not collide (Preact's island-id analogue).
 */

/** @type {WeakMap<object, { id: number }>} */
const contexts = new WeakMap();

/**
 * @param {object} result
 * @returns {{ id: number }}
 */
export function getContext(result) {
	let ctx = contexts.get(result);
	if (!ctx) {
		ctx = { id: 0 };
		contexts.set(result, ctx);
	}
	return ctx;
}

/**
 * @param {object} result
 * @returns {string}
 */
export function nextIdentifierPrefix(result) {
	const ctx = getContext(result);
	const id = ctx.id++;
	return `o${id}`;
}
