// Focused coverage for behavior added in react-router 8.2.0. These assertions
// are ported from upstream href-test.ts, matchPath-test.tsx,
// path-matching-test.tsx, and router/navigation-blocking-test.ts.
import { describe, expect, it } from 'vitest';
import { href } from '../../src/lib/href';
import { createMemoryHistory } from '../../src/lib/router/history';
import { createRouter } from '../../src/lib/router/router';
import { matchPath, matchRoutes } from '../../src/lib/router/utils';

describe('react-router 8.2 regressions', () => {
	it('URL-encodes dynamic href params and preserves splat separators', () => {
		expect(href('/products/:id', { id: 'shoes/2026-summer' })).toBe(
			'/products/shoes%2F2026-summer',
		);
		expect(href('/:param/*', { param: 'a?b/c#d', '*': 'e?f/g#h' })).toBe(
			'/a%3Fb%2Fc%23d/e%3Ff/g%23h',
		);
	});

	it('extracts params after optional static segments', () => {
		expect(matchPath('/school?/user/:id', '/school/user/123')?.params).toMatchObject({
			id: '123',
		});
		expect(matchPath('/school?/user/:id', '/user/123')?.params).toMatchObject({
			id: '123',
		});
		expect(matchPath('/one?/two?/:three?', '/tres')?.params).toMatchObject({
			three: 'tres',
		});
	});

	it('ranks static routes above dynamic params with static suffixes', () => {
		const matches = matchRoutes([{ path: '/:lang.xml' }, { path: '/sitemap.xml' }], '/sitemap.xml');
		expect(matches?.map((match) => match.route.path)).toEqual(['/sitemap.xml']);
	});

	it('preserves a blocked navigation through revalidation', async () => {
		const router = createRouter({
			history: createMemoryHistory({ initialEntries: ['/'] }),
			routes: [{ path: '/', loader: () => null }, { path: '/about' }],
		}).initialize();
		const blocker = () => true;

		router.getBlocker('KEY', blocker);
		await router.navigate('/about');
		expect(router.getBlocker('KEY', blocker).state).toBe('blocked');

		await router.revalidate();
		expect(router.getBlocker('KEY', blocker).state).toBe('blocked');
		router.dispose();
	});
});
