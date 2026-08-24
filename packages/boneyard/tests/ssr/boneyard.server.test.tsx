/** @jsxImportSource octane */
import { renderToString } from 'octane/server';
import { describe, expect, it } from 'vitest';

import { Skeleton } from '../../src/index';

describe('@octanejs/boneyard SSR', () => {
	// @parity-case differential:boneyard-ssr
	it('emits deterministic first-frame skeleton markup from static bones', () => {
		const props = {
			name: 'server-card',
			loading: true,
			animate: 'solid' as const,
			initialBones: {
				breakpoints: {
					'375': { width: 300, height: 40, bones: [[0, 0, 100, 40, 4] as const] },
					'768': { width: 700, height: 80, bones: [[0, 0, 100, 80, 4] as const] },
				},
			},
		};
		const first = renderToString(Skeleton, props).html;
		const second = renderToString(Skeleton, props).html;
		expect(first).toBe(second);
		expect(first).toContain('data-boneyard="server-card"');
		expect(first).toContain('height:40px');
		expect(first).toContain('aria-busy="true"');
	});
});
