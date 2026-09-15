// @vitest-environment node
import { expect, it } from 'vitest';
// @ts-expect-error The checker inspects source modules directly and has no declaration emit.
import { compareEntrypoint } from '../../scripts/export-contract.mjs';

it.each(['.', './ssr/client', './ssr/server'])(
	'retains every published upstream export in %s',
	(entrypoint) => {
		const result = compareEntrypoint(entrypoint);
		expect(result.upstream.length).toBeGreaterThan(0);
		expect(result.missing).toEqual([]);
	},
	30_000,
);
