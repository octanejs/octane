import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { containedPath } from '../scripts/serve-registry.mjs';

// The registry server's path containment, asserted on BOTH path flavors.
//
// This exists because the original check was `target.startsWith(root + '/')`, which is correct on
// posix and catastrophically wrong on Windows: `resolve` returns backslashes there, so every
// in-tree file failed the prefix test and the server answered 403 to everything — the registry
// would have been completely dead for any Windows developer running `registry:serve`.
//
// CI is `ubuntu-latest` only, so no amount of running the server would have caught that. Testing
// the predicate against `path.win32` from a Linux run is the only way this stays fixed, which is
// why the helper takes an injectable path implementation.
const IN_TREE = [
	'button.json',
	'registry.json',
	'styles/base-nova/button.json',
	'styles/aria-nova/utils.json',
];
const ESCAPES = ['../package.json', '../../secrets.txt', 'styles/../../package.json'];

describe('@octanejs/shadcn — registry server path containment', () => {
	for (const [flavor, impl] of [
		['posix', path.posix],
		['win32', path.win32],
	] as const) {
		const root =
			flavor === 'win32'
				? 'C:\\repo\\packages\\shadcn\\registry'
				: '/repo/packages/shadcn/registry';

		it(`${flavor}: resolves every in-tree path`, () => {
			for (const req of IN_TREE) {
				expect(containedPath(root, req, impl), `${flavor} rejected in-tree ${req}`).not.toBe(null);
			}
		});

		it(`${flavor}: rejects paths that escape the root`, () => {
			for (const req of ESCAPES) {
				expect(containedPath(root, req, impl), `${flavor} allowed escaping ${req}`).toBe(null);
			}
		});

		it(`${flavor}: does not treat a sibling directory as in-tree`, () => {
			// The reason containment cannot be a bare `startsWith(root)` without a separator:
			// `registry-old/` shares the prefix but is a different directory.
			expect(containedPath(root, '../registry-old/button.json', impl)).toBe(null);
		});

		it(`${flavor}: allows the root itself`, () => {
			expect(containedPath(root, '', impl)).not.toBe(null);
		});
	}
});
