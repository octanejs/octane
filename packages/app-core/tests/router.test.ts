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

	it('falls through to a catch-all when a dynamic server route rejects the method', function () {
		const getOnly = new ServerRoute({
			path: '/items/:id',
			methods: ['GET'],
			handler: function () {
				return new Response();
			},
		});
		const catchAll = new RenderRoute({ path: '/*rest', entry: '/src/fallback.tsrx' });
		const router = createRouter([getOnly, catchAll]);

		expect(router.match('GET', '/items/7')).toEqual({ route: getOnly, params: { id: '7' } });
		expect(router.match('POST', '/items/7')).toEqual({
			route: catchAll,
			params: { rest: 'items/7' },
		});
	});

	it('keeps equal-specificity insertion order when two dynamic routes match', function () {
		const byId = new RenderRoute({ path: '/users/:id', entry: '/src/user.tsrx' });
		const byOrg = new RenderRoute({ path: '/:org/users', entry: '/src/org-users.tsrx' });
		const insertedFirst = createRouter([byId, byOrg]);
		const insertedSecond = createRouter([byOrg, byId]);

		expect(insertedFirst.match('GET', '/users/users')).toEqual({
			route: byId,
			params: { id: 'users' },
		});
		expect(insertedSecond.match('GET', '/users/users')).toEqual({
			route: byOrg,
			params: { org: 'users' },
		});
	});

	it('prefers a parameter route over a same-prefix catch-all', function () {
		const parameterRoute = new RenderRoute({ path: '/posts/:id', entry: '/src/post.tsrx' });
		const catchAll = new RenderRoute({ path: '/posts/*rest', entry: '/src/rest.tsrx' });
		const router = createRouter([catchAll, parameterRoute]);

		expect(router.match('GET', '/posts/hello')).toEqual({
			route: parameterRoute,
			params: { id: 'hello' },
		});
		expect(router.match('GET', '/posts/hello/comments')).toEqual({
			route: catchAll,
			params: { rest: 'hello/comments' },
		});
	});

	it('matches a static suffix after a mid-path catch-all', function () {
		const download = new RenderRoute({
			path: '/files/*rest/download',
			entry: '/src/download.tsrx',
		});
		const router = createRouter([download]);

		expect(router.match('GET', '/files/a/b/c/download')).toEqual({
			route: download,
			params: { rest: 'a/b/c' },
		});
	});

	it('matches pure parameter routes and preserves catch-all slashes', function () {
		const pair = new RenderRoute({ path: '/:left/:right', entry: '/src/pair.tsrx' });
		const docs = new RenderRoute({ path: '/docs/*slug', entry: '/src/docs.tsrx' });
		const router = createRouter([pair, docs]);

		expect(router.match('GET', '/foo/bar')).toEqual({
			route: pair,
			params: { left: 'foo', right: 'bar' },
		});
		expect(router.match('GET', '/docs/guides/setup/')).toEqual({
			route: docs,
			params: { slug: 'guides/setup/' },
		});
	});
});
