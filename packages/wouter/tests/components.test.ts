import { Fragment, createElement as h, type OctaneNode } from 'octane';
import { act, fireEvent, render, renderHook } from '@octanejs/testing-library';
import { describe, expect, it, test, vi } from 'vitest';
import {
	Link,
	Redirect,
	Route,
	Router,
	Switch,
	useLocation,
	useParams,
	useRouter,
	useSearchParams,
	type AroundNavHandler,
	type Parser,
	type RegexRouteParams,
	type RouterProps,
	type StringRouteParams,
} from '@octanejs/wouter';
import { memoryLocation } from '@octanejs/wouter/memory-location';
import { NestedElementRoute, RenderPropRoute } from './_fixtures/route-children.tsrx';

function routerWrapper(options: Omit<RouterProps, 'children'>) {
	function Wrapper({ children }: { children: OctaneNode }) {
		return h(Router, { ...options, children } as RouterProps);
	}
	return Wrapper;
}

function renderInMemory(
	children: OctaneNode,
	options: {
		path?: string;
		searchPath?: string;
		state?: unknown;
		static?: boolean;
	} = {},
) {
	const memory = memoryLocation({ ...options, record: true });
	const result = render(
		h(Router, {
			hook: memory.hook,
			children,
		} as RouterProps),
	);
	return { ...result, memory };
}

// Per packages/wouter/upstream/canonical/test/link.test.tsx
describe('Link', () => {
	test('renders a link with proper attributes', () => {
		const { getByRole } = renderInMemory(
			h(Link, {
				href: '/users',
				className: 'link',
				children: 'Users',
			}),
		);
		const link = getByRole('link');
		expect(link.getAttribute('href')).toBe('/users');
		expect(link.getAttribute('class')).toBe('link');
		expect(link.textContent).toBe('Users');
	});

	test('passes ref to <a />', () => {
		const ref = { current: null as HTMLAnchorElement | null };
		renderInMemory(h(Link, { href: '/', ref, children: 'Home' }));
		expect(ref.current).toBeInstanceOf(HTMLAnchorElement);
	});

	test('still creates a plain link when nothing is passed', () => {
		const { container } = renderInMemory(h(Link, { href: '', children: undefined }));
		expect(container.querySelector('a')).not.toBeNull();
	});

	test('supports `to` prop as an alias to `href`', () => {
		const { getByRole } = renderInMemory(h(Link, { to: '/about', children: 'About' }));
		expect(getByRole('link').getAttribute('href')).toBe('/about');
	});

	test('performs a navigation when the link is clicked', () => {
		const { getByRole, memory } = renderInMemory(h(Link, { href: '/about', children: 'About' }));
		fireEvent.click(getByRole('link'));
		expect(memory.history).toStrictEqual(['/', '/about']);
	});

	test('supports replace navigation', () => {
		const { getByRole, memory } = renderInMemory(
			h(Link, {
				href: '/about',
				replace: true,
				children: 'About',
			}),
		);
		fireEvent.click(getByRole('link'));
		expect(memory.history).toStrictEqual(['/about']);
	});

	test('ignores the navigation when clicked with modifiers', () => {
		const { getByRole, memory } = renderInMemory(h(Link, { href: '/about', children: 'About' }));
		fireEvent.click(getByRole('link'), { ctrlKey: true });
		fireEvent.click(getByRole('link'), { metaKey: true });
		fireEvent.click(getByRole('link'), { altKey: true });
		fireEvent.click(getByRole('link'), { shiftKey: true });
		fireEvent.click(getByRole('link'), { button: 1 });
		expect(memory.history).toStrictEqual(['/']);
	});

	test('ignores the navigation when event is cancelled', () => {
		const { getByRole, memory } = renderInMemory(
			h(Link, {
				href: '/about',
				onClick: (event: MouseEvent) => event.preventDefault(),
				children: 'About',
			}),
		);
		fireEvent.click(getByRole('link'));
		expect(memory.history).toStrictEqual(['/']);
	});

	test('accepts an `onClick` prop, fired before the navigation', () => {
		const observed: string[] = [];
		const { getByRole, memory } = renderInMemory(
			h(Link, {
				href: '/about',
				onClick: () => observed.push(memory.history?.at(-1) ?? ''),
				children: 'About',
			}),
		);
		fireEvent.click(getByRole('link'));
		expect(observed).toStrictEqual(['/']);
		expect(memory.history?.at(-1)).toBe('/about');
	});

	test('renders `href` with basepath', () => {
		const memory = memoryLocation({ path: '/app' });
		const { getByRole } = render(
			h(Router, {
				hook: memory.hook,
				base: '/app',
				children: h(Link, { href: '/users', children: 'Users' }),
			} as RouterProps),
		);
		expect(getByRole('link').getAttribute('href')).toBe('/app/users');
	});

	test('renders `href` with absolute links', () => {
		const { getByRole } = renderInMemory(
			h(Router, {
				base: '/app',
				children: h(Link, { href: '~/users', children: 'Users' }),
			} as RouterProps),
		);
		expect(getByRole('link').getAttribute('href')).toBe('/users');
	});

	test('supports history state', () => {
		const { getByRole, memory } = renderInMemory(
			h(Link, {
				href: '/about',
				state: { from: 'home' },
				children: 'About',
			}),
		);
		fireEvent.click(getByRole('link'));
		expect(memory.state).toStrictEqual({ from: 'home' });
	});

	test('can be configured to use custom href formatting', () => {
		const memory = memoryLocation();
		const { getByRole } = render(
			h(Router, {
				hook: memory.hook,
				hrefs: (href: string) => `#${href}`,
				children: h(Link, { href: '/about', children: 'About' }),
			} as RouterProps),
		);
		expect(getByRole('link').getAttribute('href')).toBe('#/about');
	});

	test('proxies `className` when it is a string', () => {
		const { getByRole } = renderInMemory(
			h(Link, {
				href: '/',
				className: 'active',
				children: 'Home',
			}),
		);
		expect(getByRole('link').getAttribute('class')).toBe('active');
	});

	test('calls the `className` function with active link flag', () => {
		const className = vi.fn((active: boolean) => (active ? 'active' : 'inactive'));
		const { getByRole } = renderInMemory(h(Link, { href: '/', className, children: 'Home' }));
		expect(className).toHaveBeenCalledWith(true);
		expect(getByRole('link').getAttribute('class')).toBe('active');
	});

	test('when `asChild` is not specified, wraps the children in an <a />', () => {
		const { container } = renderInMemory(
			h(Link, {
				href: '/about',
				children: h('button', { children: 'About' }),
			}),
		);
		expect(container.querySelector('a > button')?.textContent).toBe('About');
	});

	test('when invalid element is provided, wraps the children in an <a />', () => {
		const { container } = renderInMemory(
			h(Link, {
				href: '/about',
				asChild: true,
				children: 'About' as never,
			}),
		);
		expect(container.querySelector('a')?.textContent).toBe('About');
	});

	test('when more than one element is provided, wraps the children in an <a />', () => {
		const { container } = renderInMemory(
			h(Link, {
				href: '/about',
				asChild: true,
				children: [h('span', { children: 'A' }), h('span', { children: 'B' })] as never,
			}),
		);
		expect(container.querySelectorAll('a > span')).toHaveLength(2);
	});

	test('injects href prop when rendered with `asChild`', () => {
		const { container } = renderInMemory(
			h(Link, {
				href: '/about',
				asChild: true,
				children: h('button', { children: 'About' }),
			}),
		);
		expect(container.querySelector('button')?.getAttribute('href')).toBe('/about');
	});

	test("missing href or to won't crash", () => {
		const { container } = renderInMemory(h(Link, { children: 'Empty' } as never));
		expect(container.querySelector('a')?.getAttribute('href')).toBe('');
	});
});

// Per packages/wouter/upstream/canonical/test/route.test.tsx
describe('Route', () => {
	it('always renders its content when `path` is empty', () => {
		const { container } = renderInMemory(h(Route, { children: h('span', { children: 'always' }) }));
		expect(container.textContent).toBe('always');
	});

	it('accepts plain children', () => {
		const { container } = renderInMemory(
			h(Route, {
				path: '/users',
				children: h('span', { children: 'users' }),
			}),
			{ path: '/users' },
		);
		expect(container.textContent).toBe('users');
	});

	it('renders nested TSRX element children instead of calling them as render-props', () => {
		const { container } = render(NestedElementRoute, {
			props: { hook: memoryLocation({ path: '/about', static: true }).hook },
		});
		expect(container.textContent).toBe('about');
	});

	it('works with render props', () => {
		const { container } = renderInMemory(
			h(Route, {
				path: '/users/:id',
				children: (params: StringRouteParams<'/users/:id'>) => h('span', { children: params.id }),
			}),
			{ path: '/users/42' },
		);
		expect(container.textContent).toBe('42');
	});

	it('invokes TSRX render-prop children with route params', () => {
		const { container } = render(RenderPropRoute, {
			props: { hook: memoryLocation({ path: '/users/42', static: true }).hook },
		});
		expect(container.textContent).toBe('42');
	});

	it('passes a match param object to the render function', () => {
		const renderChild = vi.fn((params: StringRouteParams<'/users/:name'>) =>
			h('span', { children: params.name }),
		);
		renderInMemory(h(Route, { path: '/users/:name', children: renderChild }), {
			path: '/users/alex',
		});
		expect(renderChild).toHaveBeenCalledWith({ 0: 'alex', name: 'alex' });
	});

	it('renders nothing when there is not match', () => {
		const { container } = renderInMemory(h(Route, { path: '/users', children: 'users' }), {
			path: '/about',
		});
		expect(container.textContent).toBe('');
	});

	it('supports `component` prop similar to React-Router', () => {
		function User({ params }: { params: { id?: string } }) {
			return h('span', { children: params.id });
		}
		const { container } = renderInMemory(h(Route, { path: '/users/:id', component: User }), {
			path: '/users/7',
		});
		expect(container.textContent).toBe('7');
	});

	it('supports `base` routers with relative path', () => {
		const memory = memoryLocation({ path: '/app/users' });
		const { container } = render(
			h(Router, {
				hook: memory.hook,
				base: '/app',
				children: h(Route, {
					path: '/users',
					children: 'users',
				}),
			} as RouterProps),
		);
		expect(container.textContent).toBe('users');
	});

	it('supports `path` prop with regex', () => {
		const { container } = renderInMemory(h(Route, { path: /[/]users[/](\d+)/, children: 'user' }), {
			path: '/users/42',
		});
		expect(container.textContent).toBe('user');
	});

	it('supports regex path named params', () => {
		const { container } = renderInMemory(
			h(Route, {
				path: /[/]users[/](?<id>\d+)/,
				children: (params: RegexRouteParams) => h('span', { children: params.id }),
			}),
			{ path: '/users/42' },
		);
		expect(container.textContent).toBe('42');
	});

	it('supports regex path anonymous params', () => {
		const { container } = renderInMemory(
			h(Route, {
				path: /[/]users[/](\d+)/,
				children: (params: RegexRouteParams) => h('span', { children: params[0] }),
			}),
			{ path: '/users/42' },
		);
		expect(container.textContent).toBe('42');
	});

	it('rejects when a path does not match the regex', () => {
		const { container } = renderInMemory(h(Route, { path: /[/]users[/](\d+)/, children: 'user' }), {
			path: '/about',
		});
		expect(container.textContent).toBe('');
	});
});

// Per packages/wouter/upstream/canonical/test/switch.test.tsx
describe('Switch', () => {
	it('works well when nothing is provided', () => {
		const { container } = renderInMemory(h(Switch, { children: undefined as never }));
		expect(container.textContent).toBe('');
	});

	it('always renders no more than 1 matched children', () => {
		// OCTANE DIVERGENCE: Switch must inspect explicit element descriptors;
		// nested TSRX children are opaque render blocks.
		const children = [
			h(Route, { path: '/users', children: 'first' }),
			h(Route, { path: '/users', children: 'second' }),
		];
		const { container } = renderInMemory(h(Switch, { children }), { path: '/users' });
		expect(container.textContent).toBe('first');
	});

	it('ignores mixed children', () => {
		const { container } = renderInMemory(
			h(Switch, {
				children: [false, 'text', h(Route, { path: '/users', children: 'users' })],
			}),
			{ path: '/users' },
		);
		expect(container.textContent).toBe('users');
	});

	it('ignores falsy children', () => {
		const { container } = renderInMemory(
			h(Switch, {
				children: [false, null, undefined, h(Route, { path: '/users', children: 'users' })],
			}),
			{ path: '/users' },
		);
		expect(container.textContent).toBe('users');
	});

	it('matches regular components as well', () => {
		function CustomRoute({ match }: { match?: [boolean] }) {
			return match?.[0] ? 'custom' : null;
		}
		const { container } = renderInMemory(
			h(Switch, {
				children: h(CustomRoute, { path: '/users' } as never),
			}),
			{ path: '/users' },
		);
		expect(container.textContent).toBe('custom');
	});

	it('allows to specify which routes to render via `location` prop', () => {
		const { container } = renderInMemory(
			h(Switch, {
				location: '/about',
				children: [
					h(Route, { path: '/users', children: 'users' }),
					h(Route, { path: '/about', children: 'about' }),
				],
			}),
			{ path: '/users' },
		);
		expect(container.textContent).toBe('about');
	});

	it('supports catch-all routes with wildcard segments', () => {
		const { container } = renderInMemory(
			h(Switch, {
				children: [
					h(Route, { path: '/users', children: 'users' }),
					h(Route, { path: '/*', children: 'fallback' }),
				],
			}),
			{ path: '/about' },
		);
		expect(container.textContent).toBe('fallback');
	});

	it('uses a route without a path prop as a fallback', () => {
		const { container } = renderInMemory(
			h(Switch, {
				children: [
					h(Route, { path: '/users', children: 'users' }),
					h(Route, { children: 'fallback' }),
				],
			}),
			{ path: '/about' },
		);
		expect(container.textContent).toBe('fallback');
	});

	it('correctly handles arrays as children', () => {
		const { container } = renderInMemory(
			h(Switch, {
				children: [[h(Route, { path: '/users', children: 'users' })]],
			}),
			{ path: '/users' },
		);
		expect(container.textContent).toBe('users');
	});

	it('correctly handles fragments as children', () => {
		const { container } = renderInMemory(
			h(Switch, {
				children: h(Fragment, {
					children: [
						h(Route, { path: '/users', children: 'users' }),
						h(Route, { path: '/about', children: 'about' }),
					],
				}),
			}),
			{ path: '/about' },
		);
		expect(container.textContent).toBe('about');
	});
});

// Per packages/wouter/upstream/canonical/test/redirect.test.tsx
describe('Redirect', () => {
	test('renders nothing', () => {
		const { container } = renderInMemory(h(Redirect, { to: '/next' }));
		expect(container.textContent).toBe('');
	});

	test('results in change of current location', () => {
		const { memory } = renderInMemory(h(Redirect, { to: '/next' }));
		expect(memory.history?.at(-1)).toBe('/next');
	});

	test('supports `base` routers with relative path', () => {
		const memory = memoryLocation({ record: true });
		render(
			h(Router, {
				hook: memory.hook,
				base: '/app',
				children: h(Redirect, { to: '/users' }),
			} as RouterProps),
		);
		expect(memory.history?.at(-1)).toBe('/app/users');
	});

	test('supports `base` routers with absolute path', () => {
		const memory = memoryLocation({ record: true });
		render(
			h(Router, {
				hook: memory.hook,
				base: '/app',
				children: h(Redirect, { to: '~/users' }),
			} as RouterProps),
		);
		expect(memory.history?.at(-1)).toBe('/users');
	});

	test('supports replace navigation', () => {
		const { memory } = renderInMemory(h(Redirect, { to: '/next', replace: true }));
		expect(memory.history).toStrictEqual(['/next']);
	});

	test('supports history state', () => {
		const { memory } = renderInMemory(h(Redirect, { to: '/next', state: { from: 'home' } }));
		expect(memory.state).toStrictEqual({ from: 'home' });
	});
});

// Per packages/wouter/upstream/canonical/test/router.test.tsx
describe('Router', () => {
	it('creates a router object on demand', () => {
		const { result } = renderHook(() => useRouter());
		expect(result.current.base).toBe('');
		expect(result.current.hook).toBeDefined();
	});

	it('creates a router object only once', () => {
		const first = renderHook(() => useRouter()).result.current;
		const second = renderHook(() => useRouter()).result.current;
		expect(first).toBe(second);
	});

	it('does not create new router when <Router /> rerenders', () => {
		const { result, rerender } = renderHook(() => useRouter(), {
			wrapper: routerWrapper({ base: '/app' }),
		});
		const first = result.current;
		rerender();
		expect(result.current).toBe(first);
	});

	it('accepts `ssrPath` and `ssrSearch` params', () => {
		const { result } = renderHook(() => useRouter(), {
			wrapper: routerWrapper({
				ssrPath: '/server',
				ssrSearch: '?mode=ssr',
			}),
		});
		expect(result.current.ssrPath).toBe('/server');
		expect(result.current.ssrSearch).toBe('?mode=ssr');
	});

	it("can extract `ssrSearch` from `ssrPath` after the '?' symbol", () => {
		const { result } = renderHook(() => useRouter(), {
			wrapper: routerWrapper({ ssrPath: '/server?mode=ssr' }),
		});
		expect(result.current.ssrPath).toBe('/server');
		expect(result.current.ssrSearch).toBe('mode=ssr');
	});

	describe('base', () => {
		it('is an empty string by default', () => {
			expect(renderHook(() => useRouter()).result.current.base).toBe('');
		});

		it('can be customized via the `base` prop', () => {
			const { result } = renderHook(() => useRouter(), {
				wrapper: routerWrapper({ base: '/app' }),
			});
			expect(result.current.base).toBe('/app');
		});
	});
});

// Per packages/wouter/upstream/canonical/test/use-params.test.tsx
describe('useParams', () => {
	test('returns empty object when used outside of <Route />', () => {
		expect(renderHook(() => useParams()).result.current).toStrictEqual({});
	});

	test('returns an empty object when there are no params', () => {
		const { result } = renderHook(() => useParams(), {
			wrapper: function Wrapper({ children }) {
				return h(Router, {
					hook: memoryLocation({ path: '/about' }).hook,
					children: h(Route, { path: '/about', children }),
				} as RouterProps);
			},
		});
		expect(result.current).toStrictEqual({});
	});

	test('contains parameters from the closest parent <Route />', () => {
		const { result } = renderHook(() => useParams(), {
			wrapper: function Wrapper({ children }) {
				return h(Router, {
					hook: memoryLocation({ path: '/users/42' }).hook,
					children: h(Route, {
						path: '/users/:id',
						children,
					}),
				} as RouterProps);
			},
		});
		expect(result.current).toStrictEqual({ 0: '42', id: '42' });
	});
});

// Per packages/wouter/upstream/canonical/test/use-search-params.test.tsx
describe('useSearchParams', () => {
	test('can return browser search params', () => {
		history.replaceState(null, '', '/users?active=true');
		const { result } = renderHook(() => useSearchParams());
		expect(result.current[0].get('active')).toBe('true');
	});

	test('can change browser search params', () => {
		history.replaceState(null, '', '/users?active=true');
		const { result } = renderHook(() => useSearchParams());
		act(() =>
			result.current[1]((previous) => {
				previous.set('active', 'false');
				return previous;
			}),
		);
		expect(result.current[0].get('active')).toBe('false');
	});

	test('does not add question mark when search string is empty', () => {
		const { result } = renderHook(() => useSearchParams());
		act(() => result.current[1]({}));
		expect(location.search).toBe('');
	});
});

// Per packages/wouter/upstream/canonical/test/view-transitions.test.tsx
describe('view transitions', () => {
	test('Link with transition prop triggers aroundNav with transition in options', () => {
		const aroundNav: AroundNavHandler = vi.fn((navigate, to, options) => navigate(to, options));
		const memory = memoryLocation();
		const { getByRole } = render(
			h(Router, {
				hook: memory.hook,
				aroundNav,
				children: h(Link, {
					href: '/next',
					transition: true,
					children: 'Next',
				}),
			} as RouterProps),
		);
		fireEvent.click(getByRole('link'));
		expect(aroundNav).toHaveBeenCalledWith(
			expect.any(Function),
			'/next',
			expect.objectContaining({ transition: true }),
		);
	});

	test('useLocation navigate with transition option triggers aroundNav', () => {
		const aroundNav: AroundNavHandler = vi.fn((navigate, to, options) => navigate(to, options));
		const memory = memoryLocation();
		const { result } = renderHook(() => useLocation(), {
			wrapper: routerWrapper({ hook: memory.hook, aroundNav }),
		});
		act(() => result.current[1]('/next', { transition: true }));
		expect(aroundNav).toHaveBeenCalledWith(
			expect.any(Function),
			'/next',
			expect.objectContaining({ transition: true }),
		);
	});

	test("navigation does not happen if aroundNav doesn't call navigate", () => {
		const memory = memoryLocation({ record: true });
		const { result } = renderHook(() => useLocation(), {
			wrapper: routerWrapper({
				hook: memory.hook,
				aroundNav: () => undefined,
			}),
		});
		act(() => result.current[1]('/blocked'));
		expect(memory.history).toStrictEqual(['/']);
	});
});

// Per packages/wouter/upstream/canonical/test/parser.test.tsx
describe('parser', () => {
	const parser: Parser = (route) => ({
		pattern: new RegExp(`^${route.replace(':id', '(\\d+)')}$`, 'i'),
		keys: ['id'],
	});

	test('overrides the `parser` prop on the current router', () => {
		const { result } = renderHook(() => useRouter(), {
			wrapper: routerWrapper({ parser }),
		});
		expect(result.current.parser).toBe(parser);
	});

	test('allows to change the behaviour of route matching', () => {
		const { container } = render(
			h(Router, {
				hook: memoryLocation({ path: '/users/42' }).hook,
				parser,
				children: h(Route, {
					path: '/users/:id',
					children: (params: StringRouteParams<'/users/:id'>) => h('span', { children: params.id }),
				}),
			} as RouterProps),
		);
		expect(container.textContent).toBe('42');
	});
});
