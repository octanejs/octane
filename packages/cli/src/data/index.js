import { readFileSync } from 'node:fs';

/**
 * The binding and error-code catalogs, snapshotted from the octane repository
 * at publish time by `scripts/generate-cli-data.mjs`. Read from disk rather
 * than imported so the module works identically under Node, vitest, and any
 * bundler.
 */
export const DATA = JSON.parse(
	readFileSync(new URL('./octane-data.json', import.meta.url), 'utf8'),
);

/** Matches `formatProdErrorMessage` in packages/octane/src/error-message.ts. */
export const ERROR_DOCS_URL = 'https://octanejs.dev/errors/';

/**
 * @typedef {Object} Binding
 * @property {string} name
 * @property {string} version
 * @property {string} category
 * @property {{ package: string, version: string } | null} upstream
 * @property {string} surface
 * @property {string[]} divergences
 * @property {string} ssr
 * @property {string | null} verified
 */

/** @type {Binding[]} */
export const BINDINGS = DATA.bindings;

/**
 * Resolve what a user asked for to the binding that provides it.
 *
 * Accepts the binding's own name, the React package it ports, or any upstream
 * package recorded in that binding's status.json.
 *
 * @param {string} name
 * @returns {{ binding: Binding, via: 'binding' | 'react-package' } | null}
 */
export function resolveBinding(name) {
	const direct = BINDINGS.find((binding) => binding.name === name);
	if (direct) return { binding: direct, via: 'binding' };

	const mapped = DATA.reactPackages[name];
	const fromMap = mapped && BINDINGS.find((binding) => binding.name === mapped);
	if (fromMap) return { binding: fromMap, via: 'react-package' };

	const upstream = BINDINGS.find((binding) => binding.upstream?.package === name);
	return upstream ? { binding: upstream, via: 'react-package' } : null;
}

/**
 * @param {string} query
 * @param {{ surface?: boolean }} [options] search the prose too. Useful for an
 *   explicit `octane bindings <query>`, but too loose for "did you mean",
 *   where matching a word buried in a paragraph suggests unrelated packages.
 * @returns {Binding[]}
 */
export function searchBindings(query, { surface = true } = {}) {
	const needle = query.toLowerCase();
	if (needle === '') return [];

	return BINDINGS.filter((binding) =>
		[
			binding.name,
			binding.category,
			binding.upstream?.package ?? '',
			surface ? binding.surface : '',
		]
			.join(' ')
			.toLowerCase()
			.includes(needle),
	);
}
