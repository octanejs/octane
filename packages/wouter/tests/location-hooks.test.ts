import { createElement as h, useEffect, type OctaneNode } from 'octane';
import { act, renderHook } from '@octanejs/testing-library';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { Router, useSearch, type RouterProps } from '@octanejs/wouter';
import {
	navigate as browserNavigate,
	useBrowserLocation,
	useHistoryState,
	useSearch as useBrowserSearch,
} from '@octanejs/wouter/use-browser-location';
import { navigate as hashNavigate, useHashLocation } from '@octanejs/wouter/use-hash-location';
import { memoryLocation } from '@octanejs/wouter/memory-location';

function routerWrapper(options: Omit<RouterProps, 'children'>) {
	function Wrapper({ children }: { children: OctaneNode }) {
		return h(Router, { ...options, children } as RouterProps);
	}
	return Wrapper;
}

// Per packages/wouter/upstream/canonical/test/use-browser-location.test.tsx
test('returns a pair [value, update]', () => {
	const { result } = renderHook(() => useBrowserLocation());
	expect(typeof result.current[0]).toBe('string');
	expect(typeof result.current[1]).toBe('function');
});

describe('`value` first argument', () => {
	test('reflects the current pathname', () => {
		const { result } = renderHook(() => useBrowserLocation());
		expect(result.current[0]).toBe('/');
	});

	test('reacts to `pushState` / `replaceState`', () => {
		const { result } = renderHook(() => useBrowserLocation());
		act(() => history.pushState(null, '', '/foo'));
		expect(result.current[0]).toBe('/foo');
		act(() => history.replaceState(null, '', '/bar'));
		expect(result.current[0]).toBe('/bar');
	});

	test('supports history state', () => {
		const locationResult = renderHook(() => useBrowserLocation());
		const stateResult = renderHook(() => useHistoryState());
		act(() =>
			locationResult.result.current[1]('/path', {
				state: { hello: 'world' },
			}),
		);
		expect(stateResult.result.current).toStrictEqual({ hello: 'world' });
	});

	test('uses fail-safe escaping', () => {
		const { result } = renderHook(() => useBrowserLocation());
		act(() => result.current[1]('/%not-valid'));
		expect(result.current[0]).toBe('/%not-valid');
		act(() => result.current[1]('/99%'));
		expect(result.current[0]).toBe('/99%');
	});
});

describe('`useSearch` hook', () => {
	test('allows to get current search string', () => {
		const { result } = renderHook(() => useBrowserSearch());
		act(() => browserNavigate('/foo?hello=world&whats=up'));
		expect(result.current).toBe('?hello=world&whats=up');
	});

	test('returns empty string when there is no search string', () => {
		const { result } = renderHook(() => useBrowserSearch());
		expect(result.current).toBe('');
		act(() => browserNavigate('/foo'));
		expect(result.current).toBe('');
		act(() => browserNavigate('/foo? '));
		expect(result.current).toBe('');
	});

	test('does not re-render when only pathname is changed', () => {
		const locationRenders = { current: 0 };
		const searchRenders = { current: 0 };

		renderHook(() => {
			useEffect(() => {
				locationRenders.current += 1;
			});
			return useBrowserLocation();
		});
		renderHook(() => {
			useEffect(() => {
				searchRenders.current += 1;
			});
			return useBrowserSearch();
		});

		expect(locationRenders.current).toBe(1);
		expect(searchRenders.current).toBe(1);
		act(() => browserNavigate('/foo'));
		expect(locationRenders.current).toBe(2);
		expect(searchRenders.current).toBe(1);
		act(() => browserNavigate('/foo?bar'));
		expect(locationRenders.current).toBe(2);
		expect(searchRenders.current).toBe(2);
		act(() => browserNavigate('/baz?bar'));
		expect(locationRenders.current).toBe(3);
		expect(searchRenders.current).toBe(2);
	});
});

describe('`update` second parameter', () => {
	test('rerenders the component', () => {
		const { result } = renderHook(() => useBrowserLocation());
		act(() => result.current[1]('/about'));
		expect(result.current[0]).toBe('/about');
	});

	test('changes the current location', () => {
		const { result } = renderHook(() => useBrowserLocation());
		act(() => result.current[1]('/about'));
		expect(location.pathname).toBe('/about');
	});

	test('saves a new entry in the History object', () => {
		const { result } = renderHook(() => useBrowserLocation());
		const before = history.length;
		act(() => result.current[1]('/about'));
		expect(history.length).toBe(before + 1);
	});

	test('replaces last entry with a new entry in the History object', () => {
		const { result } = renderHook(() => useBrowserLocation());
		const before = history.length;
		act(() => result.current[1]('/foo', { replace: true }));
		expect(history.length).toBe(before);
		expect(location.pathname).toBe('/foo');
	});

	test('stays the same reference between re-renders (function ref)', () => {
		const { result, rerender } = renderHook(() => useBrowserLocation());
		const update = result.current[1];
		rerender();
		expect(result.current[1]).toBe(update);
	});
});

// Per packages/wouter/upstream/canonical/test/use-hash-location.test.tsx
describe('useHashLocation', () => {
	beforeEach(() => {
		history.replaceState(null, '', '/');
	});

	test('gets current location from `location.hash`', () => {
		history.replaceState(null, '', '/#/app/users');
		const { result } = renderHook(() => useHashLocation());
		expect(result.current[0]).toBe('/app/users');
	});

	test("isn't sensitive to leading slash", () => {
		history.replaceState(null, '', '/#app/users');
		const { result } = renderHook(() => useHashLocation());
		expect(result.current[0]).toBe('/app/users');
	});

	test('changes current hash when navigation is performed', () => {
		const { result } = renderHook(() => useHashLocation());
		act(() => result.current[1]('/app/users'));
		expect(location.hash).toBe('#/app/users');
	});

	test('should not rerender when pathname changes', () => {
		let renderCount = 0;
		history.replaceState(null, '', '/#/app');
		const { result } = renderHook(() => {
			useHashLocation();
			return ++renderCount;
		});
		expect(result.current).toBe(1);
		history.replaceState(null, '', '/foo?bar#/app');
		expect(result.current).toBe(1);
	});

	test("does not change anything besides the hash when doesn't contain ? symbol", () => {
		history.replaceState(null, '', '/foo?bar#/app');
		const { result } = renderHook(() => useHashLocation());
		act(() => result.current[1]('/settings/general'));
		expect(location.pathname).toBe('/foo');
		expect(location.search).toBe('?bar');
	});

	test('changes search and hash when contains ? symbol', () => {
		history.replaceState(null, '', '/foo?bar#/app');
		const { result } = renderHook(() => useHashLocation());
		act(() => result.current[1]('/abc?def'));
		expect(location.pathname).toBe('/foo');
		expect(location.search).toBe('?def');
		expect(location.hash).toBe('#/abc');
	});

	test('creates a new history entry when navigating', () => {
		const before = history.length;
		act(() => hashNavigate('/about'));
		expect(history.length).toBe(before + 1);
	});

	test('supports `state` option when navigating', () => {
		act(() => hashNavigate('/app/users', { state: { hello: 'world' } }));
		expect(history.state).toStrictEqual({ hello: 'world' });
	});

	test('never changes reference to `navigate` between rerenders', () => {
		const { result, rerender } = renderHook(() => useHashLocation());
		const update = result.current[1];
		rerender();
		expect(result.current[1]).toBe(update);
	});

	test('is not sensitive to leading / or # when navigating', () => {
		act(() => hashNavigate('look-ma-no-slashes'));
		expect(location.hash).toBe('#/look-ma-no-slashes');
		act(() => hashNavigate('#/look-ma-no-hashes'));
		expect(location.hash).toBe('#/look-ma-no-hashes');
	});

	test('interacts properly with the history stack', () => {
		const beforeReplace = history.length;
		act(() => hashNavigate('/app/users', { replace: true }));
		expect(location.hash).toBe('#/app/users');
		expect(history.length).toBe(beforeReplace);

		const beforePush = history.length;
		act(() => hashNavigate('/app/users/2'));
		expect(location.hash).toBe('#/app/users/2');
		expect(history.length).toBe(beforePush + 1);
	});

	test('dispatches hashchange event when options.replace is true', () => {
		const listener = vi.fn();
		addEventListener('hashchange', listener);
		act(() => hashNavigate('/foo/bar', { replace: true }));
		expect(listener).toHaveBeenCalled();
		removeEventListener('hashchange', listener);
	});

	test('uses string URLs as hashchange event payload', () => {
		act(() => hashNavigate('/foo'));
		const oldURL = location.href;
		let event: HashChangeEvent | undefined;
		const listener = (nextEvent: HashChangeEvent) => {
			event = nextEvent;
		};
		addEventListener('hashchange', listener as EventListener);
		act(() => hashNavigate('/foo/bar/#hash'));
		expect(event?.oldURL).toBe(oldURL);
		expect(event?.newURL).toBe(location.href);
		removeEventListener('hashchange', listener as EventListener);
	});
});

// Per packages/wouter/upstream/canonical/test/use-search.test.tsx
describe('useSearch', () => {
	test('returns browser search string', () => {
		history.replaceState(null, '', '/users?active=true');
		const { result } = renderHook(() => useSearch());
		expect(result.current).toBe('active=true');
	});

	test('can be customized in the Router', () => {
		function customSearchHook() {
			return 'none';
		}
		const { result } = renderHook(() => useSearch(), {
			wrapper: routerWrapper({ searchHook: customSearchHook }),
		});
		expect(result.current).toBe('none');
	});

	test('can be customized with memoryLocation', () => {
		const { searchHook } = memoryLocation({ path: '/foo?key=value' });
		const { result } = renderHook(() => useSearch(), {
			wrapper: routerWrapper({ searchHook }),
		});
		expect(result.current).toBe('key=value');
	});

	test('can be customized with memoryLocation using search path parameter', () => {
		const { searchHook } = memoryLocation({
			path: '/foo?key=value',
			searchPath: 'foo=bar',
		});
		const { result } = renderHook(() => useSearch(), {
			wrapper: routerWrapper({ searchHook }),
		});
		expect(result.current).toBe('key=value&foo=bar');
	});

	test('auto-inherits searchHook from hook when not explicitly provided', () => {
		const { hook } = memoryLocation({ path: '/foo?key=value' });
		const { result } = renderHook(() => useSearch(), {
			wrapper: routerWrapper({ hook }),
		});
		expect(result.current).toBe('key=value');
	});

	test('unescapes search string', () => {
		const { result } = renderHook(() => useSearch());
		act(() => browserNavigate('/?nonce=not Found&country=საქართველო'));
		expect(result.current).toBe('nonce=not Found&country=საქართველო');
		act(() => browserNavigate('/?вопрос=как дела?'));
		expect(result.current).toBe('вопрос=как дела?');
	});

	test('is safe against parameter injection', () => {
		history.replaceState(null, '', '/?search=foo%26parameter_injection%3Dbar');
		const { result } = renderHook(() => useSearch());
		expect(Object.fromEntries(new URLSearchParams(result.current))).toEqual({
			search: 'foo&parameter_injection=bar',
		});
	});
});
