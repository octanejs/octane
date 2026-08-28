import { createElement as h } from 'octane';
import { renderToStaticMarkup } from 'octane/server';
import { describe, expect, test } from 'vitest';
import {
	Link,
	Redirect,
	Route,
	Router,
	useLocation,
	useRoute,
	useSearch,
	type RouterProps,
	type SsrContext,
} from '@octanejs/wouter';
import { withoutLocation } from './setup';

// Per packages/wouter/upstream/canonical/test/ssr.test.tsx
describe('server-side rendering', function ssrSuite() {
	test('works via `ssrPath` prop', function ssrPath() {
		function App() {
			return h(Router, {
				ssrPath: '/users/baz',
				children: [
					h(Route, { path: '/users/baz', children: 'foo' }),
					h(Route, { path: '/users/:any*', children: 'bar' }),
					h(Route, {
						path: '/users/:id',
						children: function id(params: { id?: string }) {
							return params.id;
						},
					}),
					h(Route, { path: '/about', children: 'should not be rendered' }),
				],
			} as RouterProps);
		}

		expect(renderToStaticMarkup(App).html).toBe('foobarbaz');
	});

	test('supports hook-based routes', function hookRoutes() {
		function HookRoute() {
			const [match, params] = useRoute('/pages/:name');
			return match ? `Welcome to ${params.name}!` : 'Not Found!';
		}

		function App() {
			return h(Router, {
				ssrPath: '/pages/intro',
				children: h(HookRoute),
			} as RouterProps);
		}

		expect(renderToStaticMarkup(App).html).toBe('Welcome to intro!');
	});

	test('renders valid and accessible link elements', function ssrLink() {
		function App() {
			return h(Router, {
				ssrPath: '/',
				children: h(Link, {
					href: '/users/1',
					title: 'Profile',
					children: 'Mark',
				}),
			} as RouterProps);
		}

		expect(renderToStaticMarkup(App).html).toBe('<a title="Profile" href="/users/1">Mark</a>');
	});

	test('renders redirects however they have effect only on a client-side', function ssrRedirect() {
		function App() {
			return h(Router, {
				ssrPath: '/',
				children: [
					h(Route, {
						path: '/',
						children: h(Redirect, { to: '/foo' }),
					}),
					h(Route, {
						path: '/foo',
						children: "You won't see that in SSR page",
					}),
				],
			} as RouterProps);
		}

		expect(renderToStaticMarkup(App).html).toBe('');
	});

	test('update ssr context', function ssrContext() {
		const context: SsrContext = {};
		function App() {
			return h(Router, {
				ssrPath: '/',
				ssrContext: context,
				children: h(Route, {
					path: '/',
					children: h(Redirect, { to: '/foo' }),
				}),
			} as RouterProps);
		}

		renderToStaticMarkup(App);
		expect(context.redirectTo).toBe('/foo');
		delete context.redirectTo;
	});

	describe('rendering with given search string', function searchSuite() {
		test('allows to override search string', function overrideSearch() {
			function App() {
				const search = useSearch();
				const [location] = useLocation();
				return `${location} filter by ${search}`;
			}

			expect(
				renderToStaticMarkup(function Root() {
					return h(Router, {
						ssrPath: '/catalog',
						ssrSearch: 'sort=created_at',
						children: h(App),
					} as RouterProps);
				}).html,
			).toBe('/catalog filter by sort=created_at');
		});

		test("doesn't break useSearch hook if not specified", function unspecifiedSearch() {
			function PrintSearch() {
				return useSearch();
			}

			const rendered = withoutLocation(function run() {
				return renderToStaticMarkup(function Root() {
					return h(Router, {
						ssrPath: '/',
						children: h(PrintSearch),
					} as RouterProps);
				}).html;
			});

			expect(rendered).toBe('');
		});

		test('works with empty ssrSearch', function emptySearch() {
			function PrintSearch() {
				return useSearch();
			}

			const rendered = withoutLocation(function run() {
				return renderToStaticMarkup(function Root() {
					return h(Router, {
						ssrPath: '/',
						ssrSearch: '',
						children: h(PrintSearch),
					} as RouterProps);
				}).html;
			});

			expect(rendered).toBe('');
		});
	});
});
