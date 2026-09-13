// @vitest-environment node
import { expect, it } from 'vitest';
import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr';

// Two isolated Vite server graphs include cold compiler initialization on CI.
it('initializes motion hooks deterministically without a DOM or client effects', async () => {
	expect(typeof window).toBe('undefined');
	const render = () =>
		renderHydrationFixture(
			'motion',
			'packages/motion/tests/_fixtures/server-values.tsrx',
			'ServerValues',
		);
	const first = await render();
	const second = await render();
	expect(first.html).toContain('10:20:5:0:false:true');
	expect(second.html).toBe(first.html);
}, 30_000);
