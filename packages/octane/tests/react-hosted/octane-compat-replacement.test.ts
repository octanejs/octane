/**
 * #2947: a pending OctaneCompat island whose transported component identity
 * changes (same host, same outer React key) supersedes the old attempt while
 * the React fallback stays mounted, as a direct `React.lazy` swap does.
 */
import { describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { OctaneCompat } from 'octane/react';
import { createElement as octaneElement, lazy as octaneLazy } from '../../src/index.js';
import { createLog } from '../_helpers.js';
import { h, mountReactHost, reactAct, SpikeErrorBoundary } from './_react-host.js';
import { GreetingIsland } from './_fixtures/islands.tsrx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

const Ready = () => octaneElement('b', { className: 'ready', children: 'ready' });
const Other = () => octaneElement('b', { className: 'other', children: 'other' });

function pendingLazy<T>() {
	const load = deferred<{ default: T }>();
	const loader = vi.fn(() => load.promise);
	return { load, loader, component: octaneLazy(loader as never) };
}

/** A fallback that logs its React layout mount and unmount. */
function createFallback(log: ReturnType<typeof createLog>) {
	return function Fallback() {
		React.useLayoutEffect(() => {
			log.push('fallback-mount');
			return () => log.push('fallback-unmount');
		}, []);
		return h('i', { className: 'react-fallback' }, 'loading');
	};
}

function settle(): Promise<void> {
	return reactAct(async () => {
		for (let i = 0; i < 5; i++) await Promise.resolve();
		await new Promise((done) => setTimeout(done, 0));
	});
}

describe('octane/react — replacing a pending island (#2947)', () => {
	it('reveals a ready replacement without waiting for the old load', async () => {
		const log = createLog();
		const Fallback = createFallback(log);
		const old = pendingLazy<typeof Ready>();
		const app = (component: unknown) =>
			h(React.Suspense, { fallback: h(Fallback) }, h(OctaneCompat, { component } as never));

		const mounted = await mountReactHost(app(old.component));
		expect(mounted.container.textContent).toBe('loading');
		expect(log.drain()).toEqual(['fallback-mount']);

		await mounted.render(app(GreetingIsland));
		await settle();
		// The new identity never shows a blank host.
		expect(mounted.container.querySelector('.react-fallback')).toBeNull();
		expect(mounted.host().querySelector('.greeting')?.textContent).toBe('Hello undefined');
		expect(log.drain()).toEqual(['fallback-unmount']);

		// The superseded load settles later and changes nothing.
		await reactAct(async () => {
			old.load.resolve({ default: Other });
			await old.load.promise;
		});
		await settle();
		expect(mounted.host().querySelector('.other')).toBeNull();
		expect(mounted.host().querySelector('.greeting')).not.toBeNull();
		await mounted.unmount();
	});

	it('runs the replacement effects once, after React commits it', async () => {
		const log = createLog();
		const old = pendingLazy<typeof Ready>();
		const app = (ready: boolean) =>
			h(
				React.Suspense,
				{ fallback: h('i', null, 'loading') },
				h(OctaneCompat, {
					component: ready ? GreetingIsland : old.component,
					props: ready ? { name: 'next', log: log.push } : undefined,
				} as never),
			);
		const mounted = await mountReactHost(app(false));
		await mounted.render(app(true));
		await settle();
		expect(mounted.host().querySelector('.greeting')?.textContent).toBe('Hello next');
		expect(log.drain()).toEqual(['island-layout:next']);
		await mounted.unmount();
		expect(log.drain()).toEqual(['island-cleanup:next']);
	});

	it('starts a pending replacement at once and keeps the same fallback mounted', async () => {
		const log = createLog();
		const Fallback = createFallback(log);
		const first = pendingLazy<typeof Ready>();
		const second = pendingLazy<typeof Ready>();
		const app = (component: unknown) =>
			h(React.Suspense, { fallback: h(Fallback) }, h(OctaneCompat, { component } as never));

		const mounted = await mountReactHost(app(first.component));
		expect(first.loader).toHaveBeenCalledTimes(1);
		await mounted.render(app(second.component));
		await settle();
		expect(second.loader).toHaveBeenCalledTimes(1);
		expect(mounted.container.textContent).toBe('loading');

		await reactAct(async () => {
			second.load.resolve({ default: Ready });
			await second.load.promise;
		});
		await settle();
		expect(mounted.host().querySelector('.ready')?.textContent).toBe('ready');
		expect(mounted.container.querySelector('.react-fallback')).toBeNull();
		// One fallback episode: never torn down and remounted during the switch.
		expect(log.drain()).toEqual(['fallback-mount', 'fallback-unmount']);

		await reactAct(async () => {
			first.load.resolve({ default: Other });
			await first.load.promise;
		});
		await settle();
		expect(mounted.host().querySelector('.other')).toBeNull();
		expect(mounted.host().querySelector('.ready')).not.toBeNull();
		await mounted.unmount();
	});

	it('ignores a rejection of the superseded load', async () => {
		const errors: unknown[] = [];
		const first = pendingLazy<typeof Ready>();
		const second = pendingLazy<typeof Ready>();
		const app = (component: unknown) =>
			h(
				React.Suspense,
				{ fallback: h('i', { className: 'react-fallback' }, 'loading') },
				h(OctaneCompat, { component } as never),
			);
		const mounted = await mountReactHost(app(first.component), {
			onUncaughtError: (error) => errors.push(error),
		});
		await mounted.render(app(second.component));
		await settle();

		// The old load fails while the replacement is still pending.
		await reactAct(async () => {
			first.load.reject(new Error('obsolete'));
			await first.load.promise.catch(() => {});
		});
		await settle();
		expect(errors).toEqual([]);
		expect(mounted.container.textContent).toBe('loading');

		await reactAct(async () => {
			second.load.resolve({ default: Ready });
			await second.load.promise;
		});
		await settle();
		expect(errors).toEqual([]);
		expect(mounted.host().querySelector('.ready')?.textContent).toBe('ready');
		await mounted.unmount();
	});

	it('reports a rejection of the replacement load to the React error boundary', async () => {
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const first = pendingLazy<typeof Ready>();
			const second = pendingLazy<typeof Ready>();
			const app = (component: unknown) =>
				h(
					SpikeErrorBoundary,
					{ fallback: (error: unknown) => h('p', null, String((error as Error).message)) },
					h(
						React.Suspense,
						{ fallback: h('i', null, 'loading') },
						h(OctaneCompat, { component } as never),
					),
				);
			const mounted = await mountReactHost(app(first.component));
			await mounted.render(app(second.component));
			await settle();
			await reactAct(async () => {
				second.load.reject(new Error('replacement failed'));
				await second.load.promise.catch(() => {});
			});
			await settle();
			expect(mounted.container.textContent).toContain('replacement failed');
			await mounted.unmount();
		} finally {
			quiet.mockRestore();
		}
	});

	it('does not start or reveal a replacement after the island unmounts', async () => {
		const log = createLog();
		const first = pendingLazy<typeof Ready>();
		const second = pendingLazy<typeof Ready>();
		const app = (component: unknown, show = true) =>
			h(
				React.Suspense,
				{ fallback: h('i', null, 'loading') },
				show
					? h(OctaneCompat, { component, props: { name: 'late', log: log.push } } as never)
					: null,
			);
		const mounted = await mountReactHost(app(first.component));
		await mounted.render(app(second.component));
		await mounted.render(app(second.component, false));
		await settle();
		await reactAct(async () => {
			second.load.resolve({ default: GreetingIsland as never });
			first.load.resolve({ default: GreetingIsland as never });
			await Promise.all([first.load.promise, second.load.promise]);
		});
		await settle();
		expect(log.drain()).toEqual([]);
		expect(mounted.container.querySelector('[data-octane-compat]')).toBeNull();
		await mounted.unmount();
	});
});
