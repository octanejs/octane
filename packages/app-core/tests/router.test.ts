import { describe, expect, it } from 'vitest';
import { RenderRoute, ServerRoute, createRouter } from '../src/routes.js';

describe('app-core request router', () => {
	it('preserves static, parameter, catch-all, and method matching contracts', () => {
		const staticRoute = new RenderRoute({ path: '/posts/new', entry: '/src/new.tsrx' });
		const parameterRoute = new RenderRoute({ path: '/posts/:id', entry: '/src/post.tsrx' });
		const catchAllRoute = new RenderRoute({ path: '/docs/*slug', entry: '/src/docs.tsrx' });
		const rootRoute = new RenderRoute({ path: '/', entry: '/src/home.tsrx' });
		const literalRoute = new RenderRoute({
			path: '/files/report+(final).txt',
			entry: '/src/file.tsrx',
		});
		const serverRoute = new ServerRoute({
			path: '/api/posts',
			methods: ['POST'],
			handler: () => new Response(),
		});
		const router = createRouter([
			parameterRoute,
			catchAllRoute,
			serverRoute,
			staticRoute,
			rootRoute,
			literalRoute,
		]);

		expect(router.match('GET', '/')).toEqual({ route: rootRoute, params: {} });
		expect(router.match('GET', '/posts/new')).toEqual({ route: staticRoute, params: {} });
		expect(router.match('GET', '/files/report+(final).txt')).toEqual({
			route: literalRoute,
			params: {},
		});
		expect(router.match('GET', '/posts/hello%20world')).toEqual({
			route: parameterRoute,
			params: { id: 'hello world' },
		});
		expect(router.match('GET', '/docs/guides/setup')).toEqual({
			route: catchAllRoute,
			params: { slug: 'guides/setup' },
		});
		expect(router.match('post', '/api/posts')).toEqual({ route: serverRoute, params: {} });
		expect(router.match('GET', '/api/posts')).toBeNull();
	});
});
