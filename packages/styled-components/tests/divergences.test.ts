import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import styled from '@octanejs/styled-components';

describe('@octanejs/styled-components documented divergences', () => {
	it('publishes no Babel css-prop transform entry point', () => {
		const packageJson = JSON.parse(
			readFileSync(resolve(process.cwd(), 'packages/styled-components/package.json'), 'utf8'),
		) as { exports: Record<string, unknown> };
		expect(Object.keys(packageJson.exports)).toEqual(['.']);
	});

	it('warns once after 200 creations sharing one displayName', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			for (let index = 0; index < 201; index++) {
				styled.div.withConfig({
					displayName: 'ParityDynamicProbe',
					componentId: `probe-${index}`,
				})``;
			}
			const matching = warn.mock.calls.filter((args) =>
				String(args[0]).includes('The component ParityDynamicProbe'),
			);
			expect(matching).toHaveLength(1);
			expect(String(matching[0][0])).toContain('created dynamically');
		} finally {
			warn.mockRestore();
		}
	});
});
