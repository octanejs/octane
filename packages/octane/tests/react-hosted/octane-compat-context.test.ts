/**
 * Phase 2 — transparent React context through the public `octane/react`
 * surface (react-hosted-octane-compat-plan.md §6, §13 context matrix).
 *
 * Islands are unmodified compiled Octane components calling `use()`/
 * `useContext()` with REAL React 19 context objects: the owner bridge resolves
 * each to a root-local mirror, bootstraps the committed nearest-provider value
 * from the host Fiber once, subscribes through `React.use(context)` replays in
 * the wrapper, and publishes committed snapshots (with mirror version bumps)
 * in the layout phase. When the Fiber adapter cannot serve a read — disabled,
 * unknown shape, or a providerless read whose default only React may supply —
 * the §6.3 HostContextRequest handshake retries with the authoritative value,
 * completing before paint.
 */
import { afterEach, describe, expect, it } from 'vitest';
import * as React from 'react';
import { OctaneCompat } from 'octane/react';
import { createLog, mount } from '../_helpers.js';
import { __setHostFiberAdapterEnabled } from '../../src/react/fiber-adapter.js';
import { h, mountReactHost, reactAct, SpikeErrorBoundary } from './_react-host.js';
import {
	ConditionalHostReadIsland,
	DuplicateReadIsland,
	GuardedHostThemeIsland,
	HostThemeIsland,
	HostThemeViaUseContextIsland,
	LoggingHostThemeIsland,
	MemoHostThemeIsland,
	ThemeAndResourceIsland,
	TwoHostContextsIsland,
} from './_fixtures/react-context-islands.tsrx';
import { BadgeIsland } from './_fixtures/islands.tsrx';
import { HostLocale, HostTheme } from './_fixtures/react-contexts.js';

afterEach(() => __setHostFiberAdapterEnabled(true));

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function themed(theme: string, children: React.ReactNode): React.ReactElement {
	return h(HostTheme, { value: theme } as any, children);
}

describe('octane/react — transparent React context (§6.2)', () => {
	it('reads the committed nearest-provider value with zero registration', async () => {
		const mounted = await mountReactHost(
			themed('dark', h(OctaneCompat, null, h(HostThemeIsland as any))),
		);
		expect(mounted.host().querySelector('.host-theme')?.textContent).toBe('theme:dark');
		await mounted.unmount();
	});

	it('serves useContext() through the same foreign resolution as use()', async () => {
		const mounted = await mountReactHost(
			themed('aliased', h(OctaneCompat, null, h(HostThemeViaUseContextIsland as any))),
		);
		expect(mounted.host().querySelector('.host-theme-uc')?.textContent).toBe('theme:aliased');
		await mounted.unmount();
	});

	it('stays live through provider-only updates across a memoized parent, repeatedly', async () => {
		let bridgeRenders = 0;
		const Bridge = React.memo(function Bridge(props: { children?: React.ReactNode }) {
			bridgeRenders++;
			return props.children;
		});
		// The island element is created ONCE: parent re-renders hand the memo
		// bridge identical children, so ONLY React context propagation can reach
		// the wrapper — a Fiber-read-only strategy would strand the island (§16).
		const islandElement = h(OctaneCompat, null, h(HostThemeIsland as any));
		let setTheme!: (value: string) => void;
		function App() {
			const [theme, set] = React.useState('v0');
			setTheme = set;
			return themed(theme, h(Bridge, null, islandElement));
		}
		const mounted = await mountReactHost(h(App));
		expect(mounted.host().querySelector('.host-theme')?.textContent).toBe('theme:v0');
		expect(bridgeRenders).toBe(1);

		// Several rounds so the committed provider Fiber alternates sides — the
		// subscription (not the bootstrap walk) must carry every update.
		for (let round = 1; round <= 4; round++) {
			await reactAct(async () => setTheme(`v${round}`));
			expect(mounted.host().querySelector('.host-theme')?.textContent).toBe(`theme:v${round}`);
		}
		expect(bridgeRenders).toBe(1);
		await mounted.unmount();
	});

	it('pushes committed snapshots past an island-internal memo() bailout', async () => {
		let setTheme!: (value: string) => void;
		function App() {
			const [theme, set] = React.useState('m0');
			setTheme = set;
			return themed(theme, h(OctaneCompat, null, h(MemoHostThemeIsland as any)));
		}
		const mounted = await mountReactHost(h(App));
		expect(mounted.host().querySelector('.memo-host-theme')?.textContent).toBe('memo:m0');

		await reactAct(async () => setTheme('m1'));
		expect(mounted.host().querySelector('.memo-host-theme')?.textContent).toBe('memo:m1');
		await mounted.unmount();
	});

	it('resolves the NEAREST provider under nesting, per island', async () => {
		const mounted = await mountReactHost(
			themed(
				'outer',
				h(
					'div',
					null,
					themed('inner', h(OctaneCompat, { key: 'in' } as any, h(HostThemeIsland as any))),
					h(OctaneCompat, { key: 'out' } as any, h(HostThemeIsland as any)),
				),
			),
		);
		const themes = [...mounted.container.querySelectorAll('.host-theme')].map(
			(node) => node.textContent,
		);
		expect(themes).toEqual(['theme:inner', 'theme:outer']);
		await mounted.unmount();
	});

	it('distinguishes an explicit undefined provider value from a missing provider', async () => {
		const mounted = await mountReactHost(
			h(HostTheme, { value: undefined } as any, h(OctaneCompat, null, h(HostThemeIsland as any))),
		);
		expect(mounted.host().querySelector('.host-theme')?.textContent).toBe('theme:undefined');
		await mounted.unmount();
	});

	it('serves a providerless read with the React context default via the request handshake', async () => {
		// No provider exists, so the Fiber bootstrap reports not-found and the
		// island's first attempt unwinds with a HostContextRequest; the wrapper's
		// React.use supplies the authoritative default and the retry completes
		// before paint — never a `_currentValue` inference (§6.2 step 5, §6.3).
		const mounted = await mountReactHost(h(OctaneCompat, null, h(HostThemeIsland as any)));
		expect(mounted.host().querySelector('.host-theme')?.textContent).toBe(
			'theme:host-theme-default',
		);
		await mounted.unmount();
	});

	it('registers several contexts from one island render and keeps each live', async () => {
		let setTheme!: (value: string) => void;
		let setLocale!: (value: string) => void;
		function App() {
			const [theme, updateTheme] = React.useState('t0');
			const [locale, updateLocale] = React.useState('l0');
			setTheme = updateTheme;
			setLocale = updateLocale;
			return themed(
				theme,
				h(
					HostLocale,
					{ value: locale } as any,
					h(OctaneCompat, null, h(TwoHostContextsIsland as any)),
				),
			);
		}
		const mounted = await mountReactHost(h(App));
		expect(mounted.host().querySelector('.two-host')?.textContent).toBe('t:t0 l:l0');
		await reactAct(async () => setLocale('l1'));
		expect(mounted.host().querySelector('.two-host')?.textContent).toBe('t:t0 l:l1');
		await reactAct(async () => setTheme('t1'));
		expect(mounted.host().querySelector('.two-host')?.textContent).toBe('t:t1 l:l1');
		await mounted.unmount();
	});

	it('deduplicates repeated reads of one context to one live entry', async () => {
		let setTheme!: (value: string) => void;
		function App() {
			const [theme, set] = React.useState('d0');
			setTheme = set;
			return themed(theme, h(OctaneCompat, null, h(DuplicateReadIsland as any)));
		}
		const mounted = await mountReactHost(h(App));
		expect(mounted.host().querySelector('.dup-read')?.textContent).toBe('d0/d0');
		await reactAct(async () => setTheme('d1'));
		expect(mounted.host().querySelector('.dup-read')?.textContent).toBe('d1/d1');
		await mounted.unmount();
	});

	it('subscribes a conditional FIRST read that appears only after mount', async () => {
		let setTheme!: (value: string) => void;
		function App(props: { read: boolean }) {
			const [theme, set] = React.useState('c0');
			setTheme = set;
			return themed(
				theme,
				h(OctaneCompat, null, h(ConditionalHostReadIsland as any, { read: props.read })),
			);
		}
		const mounted = await mountReactHost(h(App, { read: false }));
		expect(mounted.host().querySelector('.cond-read')?.textContent).toBe('theme:(off)');

		await mounted.render(h(App, { read: true }));
		expect(mounted.host().querySelector('.cond-read')?.textContent).toBe('theme:c0');
		await reactAct(async () => setTheme('c1'));
		expect(mounted.host().querySelector('.cond-read')?.textContent).toBe('theme:c1');
		await mounted.unmount();
	});

	it('follows provider insertion and removal around a retained island', async () => {
		function App(props: { provided: boolean }) {
			const island = h(OctaneCompat, null, h(HostThemeIsland as any));
			return props.provided ? themed('inserted', island) : island;
		}
		const mounted = await mountReactHost(h(App, { provided: false }));
		expect(mounted.host().querySelector('.host-theme')?.textContent).toBe(
			'theme:host-theme-default',
		);

		await mounted.render(h(App, { provided: true }));
		expect(mounted.host().querySelector('.host-theme')?.textContent).toBe('theme:inserted');

		await mounted.render(h(App, { provided: false }));
		expect(mounted.host().querySelector('.host-theme')?.textContent).toBe(
			'theme:host-theme-default',
		);
		await mounted.unmount();
	});

	it('isolates islands: one island’s provider update never re-renders another island', async () => {
		const log = createLog();
		const ThemeB = React.createContext('b-default');
		let setThemeA!: (value: string) => void;
		function App() {
			const [themeA, set] = React.useState('a0');
			setThemeA = set;
			return h(
				'div',
				null,
				themed(
					themeA,
					h(
						OctaneCompat,
						{ key: 'a' } as any,
						h(LoggingHostThemeIsland as any, { tag: 'A', log: log.push }),
					),
				),
				h(
					ThemeB,
					{ value: 'b0' } as any,
					h(
						OctaneCompat,
						{ key: 'b' } as any,
						h(LoggingHostThemeIsland as any, { tag: 'B', log: log.push }),
					),
				),
			);
		}
		const mounted = await mountReactHost(h(App));
		log.clear();

		// Root-local mirrors (§6.2 step 6): island A's provider change must not
		// advance island B's memo-invalidation state or re-render its body.
		await reactAct(async () => setThemeA('a1'));
		expect(log.drain()).toEqual(['render:A:a1']);
		await mounted.unmount();
	});

	it('keeps a context discovered in a suspending attempt live end-to-end', async () => {
		const resource = deferred<string>();
		let setTheme!: (value: string) => void;
		function App() {
			const [theme, set] = React.useState('dark');
			setTheme = set;
			return themed(
				theme,
				h(
					React.Suspense,
					{ fallback: h('p', { className: 'react-fallback' }, 'react pending') },
					h(OctaneCompat, null, h(ThemeAndResourceIsland as any, { resource: resource.promise })),
				),
			);
		}
		const mounted = await mountReactHost(h(App));
		expect(mounted.container.querySelector('.react-fallback')).not.toBeNull();

		// Provider-only update while the first-discovery attempt is suspended
		// (OQ15 retention makes this reach the wrapper).
		await reactAct(async () => setTheme('light'));
		await reactAct(async () => {
			resource.resolve('data');
			await resource.promise;
		});
		expect(mounted.container.querySelector('.react-fallback')).toBeNull();
		expect(mounted.host().querySelector('.theme-resource')?.textContent).toBe('light:data');
		await mounted.unmount();
	});

	it('resets context discovery when the transported child identity changes', async () => {
		let setTheme!: (value: string) => void;
		function App(props: { showReader: boolean }) {
			const [theme, set] = React.useState('r0');
			setTheme = set;
			return themed(
				theme,
				h(
					OctaneCompat,
					null,
					props.showReader ? h(HostThemeIsland as any) : h(BadgeIsland as any, { label: 'plain' }),
				),
			);
		}
		const mounted = await mountReactHost(h(App, { showReader: true }));
		expect(mounted.host().querySelector('.host-theme')?.textContent).toBe('theme:r0');

		// Swap to a non-reader: the former tree's registry is retired; provider
		// updates while it is gone must not disturb the island.
		await mounted.render(h(App, { showReader: false }));
		expect(mounted.host().querySelector('.badge')?.textContent).toBe('badge:plain');
		await reactAct(async () => setTheme('r1'));
		expect(mounted.host().querySelector('.badge')?.textContent).toBe('badge:plain');

		// Swap back: a fresh discovery reads the CURRENT provider value.
		await mounted.render(h(App, { showReader: true }));
		expect(mounted.host().querySelector('.host-theme')?.textContent).toBe('theme:r1');
		await reactAct(async () => setTheme('r2'));
		expect(mounted.host().querySelector('.host-theme')?.textContent).toBe('theme:r2');
		await mounted.unmount();
	});
});

describe('octane/react — §6.3 HostContextRequest fallback', () => {
	it('serves reads through the public handshake when the Fiber adapter is unavailable', async () => {
		__setHostFiberAdapterEnabled(false);
		let setTheme!: (value: string) => void;
		function App() {
			const [theme, set] = React.useState('h0');
			setTheme = set;
			return themed(theme, h(OctaneCompat, null, h(HostThemeIsland as any)));
		}
		const mounted = await mountReactHost(h(App));
		// First attempt unwound with the control signal; the handshake committed
		// the authoritative React.use value and retried before paint.
		expect(mounted.host().querySelector('.host-theme')?.textContent).toBe('theme:h0');

		// The handshake installed a REAL subscription — updates flow with the
		// adapter still disabled, and never through a local boundary or error arm.
		await reactAct(async () => setTheme('h1'));
		expect(mounted.host().querySelector('.host-theme')?.textContent).toBe('theme:h1');
		await mounted.unmount();
	});

	it('handshakes several contexts discovered in one attempt', async () => {
		__setHostFiberAdapterEnabled(false);
		const mounted = await mountReactHost(
			themed(
				'hs-t',
				h(
					HostLocale,
					{ value: 'hs-l' } as any,
					h(OctaneCompat, null, h(TwoHostContextsIsland as any)),
				),
			),
		);
		expect(mounted.host().querySelector('.two-host')?.textContent).toBe('t:hs-t l:hs-l');
		await mounted.unmount();
	});

	it('bypasses a local @try boundary on INITIAL mount — providerless read lands the default', async () => {
		// The reader sits inside the island's own @try with @pending and @catch
		// arms. A providerless first read raises the §6.3 request from the
		// mountTry path; the signal must reach the owner, never a local arm.
		const mounted = await mountReactHost(
			h(OctaneCompat, null, h(GuardedHostThemeIsland as any, { read: true })),
		);
		expect(mounted.host().querySelector('.guard-theme')?.textContent).toBe(
			'theme:host-theme-default',
		);
		expect(mounted.host().querySelector('.guard-caught')).toBeNull();
		expect(mounted.host().querySelector('.guard-pending')).toBeNull();
		await mounted.unmount();
	});

	it('bypasses a local @try boundary when the first read appears on a try-body RE-RENDER', async () => {
		// The try body commits WITHOUT a context read, then a prop flip makes the
		// re-render path raise the request — the in-place try re-render catch
		// must also pass the signal through instead of switching to @catch.
		__setHostFiberAdapterEnabled(false);
		let setTheme!: (value: string) => void;
		function App(props: { read: boolean }) {
			const [theme, set] = React.useState('g0');
			setTheme = set;
			return themed(
				theme,
				h(OctaneCompat, null, h(GuardedHostThemeIsland as any, { read: props.read })),
			);
		}
		const mounted = await mountReactHost(h(App, { read: false }));
		expect(mounted.host().querySelector('.guard-theme')?.textContent).toBe('theme:(off)');

		await mounted.render(h(App, { read: true }));
		expect(mounted.host().querySelector('.guard-theme')?.textContent).toBe('theme:g0');
		expect(mounted.host().querySelector('.guard-caught')).toBeNull();

		// The handshake installed a real subscription through the boundary.
		await reactAct(async () => setTheme('g1'));
		expect(mounted.host().querySelector('.guard-theme')?.textContent).toBe('theme:g1');
		await mounted.unmount();
	});

	it('never leaks the control signal into a React error boundary', async () => {
		__setHostFiberAdapterEnabled(false);
		let caught: unknown = null;
		const mounted = await mountReactHost(
			h(
				SpikeErrorBoundary,
				{
					fallback: (error: unknown) => {
						caught = error;
						return h('p', { className: 'react-caught' }, 'caught');
					},
				} as any,
				themed('safe', h(OctaneCompat, null, h(HostThemeIsland as any))),
			),
		);
		expect(caught).toBeNull();
		expect(mounted.container.querySelector('.react-caught')).toBeNull();
		expect(mounted.host().querySelector('.host-theme')?.textContent).toBe('theme:safe');
		await mounted.unmount();
	});
});

describe('use(React.Context) outside a hosted root', () => {
	it('throws the targeted diagnostic from a plain Octane root', () => {
		expect(() => mount(HostThemeIsland as any)).toThrow(
			/React context can only be read inside a React-hosted Octane island/,
		);
	});
});
