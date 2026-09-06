import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as BaseUI from '@octanejs/base-ui';
import * as ReactBaseUI from '@base-ui/react';

describe('@octanejs/base-ui parity audit contracts', () => {
	it('accounts for every pinned export and adapted test artifact', async () => {
		await import('../../scripts/check-upstream-crosswalk.mjs');
	});

	it('preserves the upstream runtime export names and component parts', () => {
		expect(Object.keys(BaseUI).sort()).toEqual(Object.keys(ReactBaseUI).sort());
		const source = readFileSync(
			resolve(import.meta.dirname, '../../upstream/src/index.ts'),
			'utf8',
		);
		const namespaces = [...source.matchAll(/export \* from '\.\/([^']+)'/g)].flatMap(
			([, entry]) => {
				const source = readFileSync(
					resolve(import.meta.dirname, '../../upstream/src', entry, 'index.ts'),
					'utf8',
				);
				return [...source.matchAll(/export \* as (\w+) from/g)].map(([, name]) => name);
			},
		);
		expect(namespaces).toContain('Select');
		expect(namespaces).toContain('Combobox');
		// Compare component namespaces. A standalone React forwardRef object
		// has renderer metadata instead of public component parts.
		for (const name of namespaces) {
			const native = BaseUI[name as keyof typeof BaseUI];
			const upstream = ReactBaseUI[name as keyof typeof ReactBaseUI];
			expect(Object.keys(native).sort(), name).toEqual(Object.keys(upstream).sort());
		}
	});
});
