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

	it('falls through to a catch-all when a static server route rejects the method', function () {
		const getOnly = new ServerRoute({
			path: '/api',
			methods: ['GET'],
			handler: function () {
				return new Response();
			},
		});
		const catchAll = new RenderRoute({ path: '/*rest', entry: '/src/fallback.tsrx' });
		const router = createRouter([getOnly, catchAll]);

		expect(router.match('GET', '/api')).toEqual({ route: getOnly, params: {} });
		expect(router.match('POST', '/api')).toEqual({
			route: catchAll,
			params: { rest: 'api' },
		});
	});

	it('selects the matching method when several static server routes share a path', function () {
		const getRoute = new ServerRoute({
			path: '/api/items',
			methods: ['GET'],
			handler: function () {
				return new Response('get');
			},
		});
		const postRoute = new ServerRoute({
			path: '/api/items',
			methods: ['POST'],
			handler: function () {
				return new Response('post');
			},
		});
		const router = createRouter([getRoute, postRoute]);

		expect(router.match('GET', '/api/items')).toEqual({ route: getRoute, params: {} });
		expect(router.match('post', '/api/items')).toEqual({ route: postRoute, params: {} });
		expect(router.match('DELETE', '/api/items')).toBeNull();
	});

	it('uses a same-path render route after a static server method miss', function () {
		const getOnly = new ServerRoute({
			path: '/shared',
			methods: ['GET'],
			handler: function () {
				return new Response();
			},
		});
		const page = new RenderRoute({ path: '/shared', entry: '/src/shared.tsrx' });
		const router = createRouter([getOnly, page]);

		expect(router.match('GET', '/shared')).toEqual({ route: getOnly, params: {} });
		expect(router.match('POST', '/shared')).toEqual({ route: page, params: {} });
	});
});
