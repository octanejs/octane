import { createElement as h, type OctaneNode } from 'octane';
import { act, render, renderHook } from '@octanejs/testing-library';
import { describe, expect, test } from 'vitest';
import { Route, Router, Switch, useRouter, type RouterProps } from '@octanejs/wouter';
import { memoryLocation } from '@octanejs/wouter/memory-location';

// Per packages/wouter/upstream/canonical/test/nested-route.test.tsx
describe('when `nest` prop is given', function nestSuite() {
	test('renders by default', function rendersByDefault() {
		const { container } = render(h(Route, { nest: true, children: 'matched!' }));
		expect(container.textContent).toBe('matched!');
	});

	test('matches the pattern loosely', function looseMatch() {
		const { hook, navigate } = memoryLocation();
		const { container } = render(
			h(Router, {
				hook,
				children: h(Route, {
					path: '/posts/:slug',
					nest: true,
					children: 'matched!',
				}),
			} as RouterProps),
		);

		expect(container.textContent).toBe('');

		act(function goPosts() {
			navigate('/posts/all');
		});
		expect(container.textContent).toBe('matched!');

		act(function goUsers() {
			navigate('/users');
		});
		expect(container.textContent).toBe('');

		act(function goNested() {
			navigate('/posts/10-react-tricks/table-of-contents');
		});
		expect(container.textContent).toBe('matched!');
	});

	test('can be used inside a Switch', function insideSwitch() {
		// OCTANE DIVERGENCE: Switch inspects explicit element descriptors.
		const { container } = render(
			h(Router, {
				hook: memoryLocation({ path: '/posts/13/2012/sort', static: true }).hook,
				children: h(Switch, {
					children: [
						h(Route, { path: '/about', children: 'about' }),
						h(Route, { path: '/posts/:slug', nest: true, children: 'nested' }),
						h(Route, { children: 'default' }),
					],
				}),
			} as RouterProps),
		);
		expect(container.textContent).toBe('nested');
	});

	test('sets the base to the matched segment', function nestedBase() {
		const { result } = renderHook(
			function useBase() {
				return useRouter().base;
			},
			{
				wrapper: function Wrapper(props: { children: OctaneNode }) {
					return h(Router, {
						hook: memoryLocation({ path: '/2012/04/posts', static: true }).hook,
						children: h(Route, {
							path: '/:year/:month',
							nest: true,
							children: h(Route, { path: '/posts', children: props.children }),
						}),
					} as RouterProps);
				},
			},
		);
		expect(result.current).toBe('/2012/04');
	});

	test('can be nested in another nested `Route` or `Router`', function nestedRoutes() {
		const { container } = render(
			h(Router, {
				base: '/app',
				hook: memoryLocation({
					path: '/app/users/alexey/settings/all',
					static: true,
				}).hook,
				children: h(Route, {
					path: '/users/:name',
					nest: true,
					children: [
						h(Route, { path: '/settings', children: 'should not be rendered' }),
						h(Route, {
							path: '/settings',
							nest: true,
							children: h(Route, { path: '/all', children: 'All settings' }),
						}),
					],
				}),
			} as RouterProps),
		);
		expect(container.textContent).toBe('All settings');
	});

	test('reacts to `nest` updates', function nestUpdates() {
		const { hook } = memoryLocation({
			path: '/app/apple/products',
			static: true,
		});

		function App(props: { nested: boolean }) {
			return h(Router, {
				hook,
				children: h(Route, {
					path: '/app/:company',
					nest: props.nested,
					children: 'matched!',
				}),
			} as RouterProps);
		}

		const { container, rerender } = render(App, { props: { nested: true } });
		expect(container.textContent).toBe('matched!');

		rerender({ props: { nested: false } });
		expect(container.textContent).toBe('');
	});

	test('works with one optional segment', function optionalSegment() {
		const { hook, navigate } = memoryLocation({ path: '/' });

		function App() {
			return h(Router, {
				hook,
				children: h(Route, {
					path: '/:version?',
					nest: true,
					children: function renderVersion(params: { version?: string }) {
						return params.version ?? 'default';
					},
				}),
			} as RouterProps);
		}

		const { container } = render(App);
		expect(container.textContent).toBe('default');

		act(function goV1() {
			navigate('/v1');
		});
		expect(container.textContent).toBe('v1');

		act(function goDashboard() {
			navigate('/v2/dashboard');
		});
		expect(container.textContent).toBe('v2');
	});
});
