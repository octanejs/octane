import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { flushSync } from 'octane';
import { mount, type MountResult } from '../_helpers.js';
import {
	ActivityLifecycleApp,
	CleanupErrorApp,
	ComponentApp,
	ContextApp,
	CounterApp,
	ErrorApp,
	ExternalPendingApp,
	ExternalResourceApp,
	HiddenApp,
	HiddenErrorApp,
	LocalErrorApp,
	LocalPendingApp,
	PendingApp,
	PendingActivityApp,
	PortalApp,
	SequentialApp,
	TransitionApp,
} from './fixtures.tsrx';

const mounted: MountResult[] = [];
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const original = environment.IS_REACT_ACT_ENVIRONMENT;
beforeAll(() => {
	environment.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
	environment.IS_REACT_ACT_ENVIRONMENT = original;
});
afterEach(async () => {
	await React.act(async () => {
		for (const root of mounted.splice(0)) root.unmount();
	});
});

async function run(callback: () => void | Promise<void>) {
	await React.act(callback);
	flushSync(() => {});
}
async function render(App: Parameters<typeof mount>[0], props?: unknown) {
	let root!: MountResult;
	await run(() => {
		root = mount(App, props);
		mounted.push(root);
	});
	return root;
}
function deferred() {
	let resolve!: (value: string) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<string>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

describe('ReactCompat through octane/react', () => {
	it('renders the requested child syntax and preserves state, ref, and neighboring Octane DOM on updates', async () => {
		const ref = React.createRef<HTMLButtonElement>();
		const changed = vi.fn();
		const root = await render(CounterApp, { start: 3, label: 'first', ref, onChange: changed });
		const button = root.find('button');
		const sibling = root.find('[data-sibling]');
		expect(button.textContent).toBe('first:3');
		expect(ref.current).toBe(button);
		await run(() => root.click('button'));
		expect(changed).toHaveBeenLastCalledWith(4);
		await run(() => root.update(CounterApp, { start: 100, label: 'next', ref, onChange: changed }));
		expect(root.find('button')).toBe(button);
		expect(button.textContent).toBe('next:4');
		expect(root.find('[data-sibling]')).toBe(sibling);
		expect(sibling.textContent).toBe('next');
	});
	it('resets a changed child key and releases refs/effects on actual deletion', async () => {
		const cleanup = vi.fn();
		const ref = React.createRef<HTMLButtonElement>();
		const root = await render(CounterApp, {
			start: 3,
			label: 'keyed',
			childKey: 'a',
			ref,
			onCleanup: cleanup,
		});
		const button = root.find('button');
		await run(() => root.click('button'));
		await run(() =>
			root.update(CounterApp, { start: 9, label: 'keyed', childKey: 'b', ref, onCleanup: cleanup }),
		);
		expect(root.find('button')).not.toBe(button);
		expect(root.find('button').textContent).toBe('keyed:9');
		await run(() => root.update(CounterApp, { show: false, label: 'deleted' }));
		expect(ref.current).toBeNull();
		expect(cleanup).toHaveBeenCalledTimes(2);
	});
	it('projects escaped initial suspension and resolves only after React content commits', async () => {
		const resource = deferred();
		const root = await render(PendingApp, { resource: resource.promise });
		expect(root.find('[data-octane-pending]').textContent).toBe('Octane pending');
		await run(async () => {
			resource.resolve('ready');
			await resource.promise;
		});
		expect(root.container.querySelector('[data-octane-pending]')).toBeNull();
		expect(root.find('[data-resource]').textContent).toBe('ready:0');
	});
	it('keeps a nearer React Suspense boundary local', async () => {
		const resource = deferred();
		const root = await render(LocalPendingApp, { resource: resource.promise });
		expect(root.find('[data-react-pending]').textContent).toBe('React pending');
		expect(root.container.querySelector('[data-octane-pending]')).toBeNull();
		await run(async () => {
			resource.resolve('local');
			await resource.promise;
		});
		expect(root.find('[data-resource]').textContent).toBe('local:0');
	});
	it.each([undefined, 'layout', 'passive'] as const)(
		'routes an escaped %s error to the Octane catch boundary',
		async (effect) => {
			const root = await render(ErrorApp, { error: new Error('React failed'), effect });
			expect(root.find('[data-octane-caught]').textContent).toBe('React failed');
			expect(root.container.querySelector('[data-react-compat]')).toBeNull();
		},
	);
	it('does not steal errors caught by an authored React boundary', async () => {
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const root = await render(LocalErrorApp, { error: new Error('local') });
			expect(root.find('[data-react-caught]').textContent).toBe('React caught');
			expect(root.container.querySelector('[data-octane-caught]')).toBeNull();
		} finally {
			quiet.mockRestore();
		}
	});
	it('projects nearest Octane context values through both memo boundaries without resetting React state', async () => {
		const root = await render(ContextApp, { value: 'light' });
		const button = root.find('[data-theme]');
		await run(() => root.click('[data-theme]'));
		await run(() => root.update(ContextApp, { value: 'dark' }));
		expect(root.find('[data-theme]')).toBe(button);
		expect(button.textContent).toBe('dark:1');
		await run(() => root.update(ContextApp, { value: undefined }));
		expect(button.textContent).toBe('undefined:1');
	});
	it('preserves state through Octane Activity hiding and releases an island deleted while hidden', async () => {
		const cleanup = vi.fn();
		const root = await render(HiddenApp, { hidden: false, onCleanup: cleanup });
		const button = root.find('button');
		await run(() => root.click('button'));
		await run(() => root.update(HiddenApp, { hidden: true, onCleanup: cleanup }));
		await run(() => root.update(HiddenApp, { hidden: false, onCleanup: cleanup }));
		expect(root.find('button')).toBe(button);
		expect(button.textContent).toBe('count:4');
		await run(() => root.update(HiddenApp, { hidden: true, onCleanup: cleanup }));
		await run(() => root.unmount());
		mounted.splice(mounted.indexOf(root), 1);
		expect(cleanup).toHaveBeenCalled();
	});
	it('removes owned portal output and subscriptions when the island is deleted', async () => {
		const target = document.createElement('div');
		document.body.append(target);
		const cleanup = vi.fn();
		try {
			const root = await render(PortalApp, { target, onCleanup: cleanup });
			expect(target.querySelector('[data-react-portal]')).not.toBeNull();
			await run(() => root.unmount());
			mounted.splice(mounted.indexOf(root), 1);
			expect(target.textContent).toBe('');
			expect(cleanup).toHaveBeenCalledOnce();
		} finally {
			target.remove();
		}
	});
	it('preserves React-local transition pending state and retained content', async () => {
		const next = deferred();
		const root = await render(TransitionApp, { next: next.promise });
		const button = root.find('[data-resource]');
		await run(() => root.click('[data-start]'));
		expect(root.find('[data-react-transition]').textContent).toBe('true');
		expect(root.find('[data-resource]')).toBe(button);
		expect(root.container.querySelector('[data-octane-pending]')).toBeNull();
		await run(async () => {
			next.resolve('arrived');
			await next.promise;
		});
		expect(root.find('[data-react-transition]').textContent).toBe('false');
		expect(button.textContent).toBe('arrived:0');
	});
	it('keeps React state across escaped update suspension and a later retry', async () => {
		const first = deferred();
		first.resolve('first');
		const root = await render(PendingApp, { resource: first.promise });
		const button = root.find('[data-resource]');
		await run(() => root.click('[data-resource]'));
		const next = deferred();
		await run(() => root.update(PendingApp, { resource: next.promise }));
		expect(root.find('[data-octane-pending]')).toBeTruthy();
		await run(async () => {
			next.resolve('second');
			await next.promise;
		});
		expect(root.find('[data-resource]')).toBe(button);
		expect(button.textContent).toBe('second:1');
	});
	it('keeps the host pending through sequential resources and delivers the original rejection', async () => {
		const first = deferred();
		const second = deferred();
		const root = await render(SequentialApp, { first: first.promise, second: second.promise });
		const fallback = root.find('[data-octane-pending]');
		await run(async () => {
			first.resolve('one');
			await first.promise;
		});
		expect(root.find('[data-octane-pending]')).toBe(fallback);
		await run(async () => {
			second.reject(new Error('second failed'));
			await second.promise.catch(() => {});
		});
		expect(root.find('[data-octane-caught]').textContent).toBe('second failed');
	});
	it('disposes an initially suspended island without resurrecting it on late settlement', async () => {
		const resource = deferred();
		const root = await render(PendingApp, { resource: resource.promise });
		await run(() => root.unmount());
		mounted.splice(mounted.indexOf(root), 1);
		await run(async () => {
			resource.resolve('too late');
			await resource.promise;
		});
		expect(root.container.textContent).toBe('');
	});
	it('can reset an escaped error after corrected Octane props', async () => {
		const root = await render(ErrorApp, { error: new Error('retry me') });
		await run(() => root.update(ErrorApp, {}));
		await run(() => root.click('[data-octane-caught]'));
		expect(root.find('[data-healthy]').textContent).toBe('healthy');
	});
	it.each(['suspense', 'activity'] as const)(
		'projects external %s hiding to React portals and effect/ref lifetimes',
		async (mode) => {
			const target = document.createElement('div');
			document.body.append(target);
			const log: string[] = [];
			const resource = deferred();
			const App = mode === 'activity' ? ActivityLifecycleApp : ExternalPendingApp;
			try {
				const root = await render(App, { target, log, hidden: false });
				const button = root.find('[data-life]');
				const portal = target.querySelector('[data-life-portal]') as HTMLElement;
				await run(() => root.click('[data-life]'));
				log.length = 0;
				await run(() =>
					root.update(App, { target, log, hidden: true, resource: resource.promise }),
				);
				expect(log).toContain('layout:off');
				expect(log).toContain('ref:off');
				expect(portal.style.display).toBe('none');
				if (mode === 'activity') expect(log).toContain('passive:off');
				else expect(log).not.toContain('passive:off');
				log.length = 0;
				await run(async () => {
					resource.resolve('ready');
					await resource.promise;
					root.update(App, { target, log, hidden: false });
				});
				expect(root.find('[data-life]')).toBe(button);
				expect(button.textContent).toBe('1');
				expect(portal.style.display).toBe('');
				expect(log).toContain('ref:on');
				expect(log).toContain('layout:on');
			} finally {
				target.remove();
			}
		},
	);
	it('routes a deferred React cleanup fault to the surviving Octane catch boundary', async () => {
		const target = document.createElement('div');
		const log: string[] = [];
		const root = await render(CleanupErrorApp, {
			show: true,
			target,
			log,
			cleanupError: new Error('cleanup failed'),
		});
		await run(() => root.update(CleanupErrorApp, { show: false, target, log }));
		expect(root.find('[data-octane-caught]').textContent).toBe('cleanup failed');
	});
	it('disconnects passive effects when an already suspended primary is hidden by Activity', async () => {
		const target = document.createElement('div');
		const log: string[] = [];
		const first = deferred();
		first.resolve('ready');
		const root = await render(PendingActivityApp, {
			target,
			log,
			resource: first.promise,
			hidden: false,
		});
		const button = root.find('[data-life]');
		await run(() => root.click('[data-life]'));
		log.length = 0;
		const next = deferred();
		await run(() =>
			root.update(PendingActivityApp, { target, log, resource: next.promise, hidden: false }),
		);
		expect(root.find('[data-octane-pending]')).toBeTruthy();
		expect(log).not.toContain('passive:off');
		await run(() =>
			root.update(PendingActivityApp, { target, log, resource: next.promise, hidden: true }),
		);
		expect(log).toContain('passive:off');
		await run(async () => {
			next.resolve('next');
			await next.promise;
		});
		await run(() =>
			root.update(PendingActivityApp, { target, log, resource: next.promise, hidden: false }),
		);
		expect(root.find('[data-life]')).toBe(button);
		expect(button.textContent).toBe('1');
		expect(root.container.querySelector('[data-octane-pending]')).toBeNull();
	});
	it('replaces an obsolete unresolved island when its outer boundary key changes', async () => {
		const old = deferred();
		const next = deferred();
		const root = await render(PendingApp, { resource: old.promise, boundaryKey: 'old' });
		expect(root.find('[data-octane-pending]')).toBeTruthy();
		await run(async () => {
			next.resolve('new');
			await next.promise;
			root.update(PendingApp, { resource: next.promise, boundaryKey: 'new' });
		});
		expect(root.find('[data-resource]').textContent).toBe('new:0');
		const button = root.find('[data-resource]');
		await run(async () => {
			old.resolve('obsolete');
			await old.promise;
		});
		expect(root.find('[data-resource]')).toBe(button);
		expect(button.textContent).toBe('new:0');
	});
	it('publishes the latest parent snapshot after the currently pending island reveals', async () => {
		const current = deferred();
		const ready = deferred();
		const root = await render(PendingApp, { resource: current.promise });
		const pending = root.find('[data-octane-pending]');
		await run(async () => {
			ready.resolve('latest');
			await ready.promise;
			root.update(PendingApp, { resource: ready.promise });
		});
		expect(root.find('[data-octane-pending]')).toBe(pending);
		await run(async () => {
			current.resolve('old');
			await current.promise;
		});
		expect(root.find('[data-resource]').textContent).toBe('latest:0');
	});
	it('transports React class instance refs and preserves state through component-form updates', async () => {
		class ClassCounter extends React.Component<{ label: string }, { count: number }> {
			state = { count: 0 };
			render() {
				return React.createElement(
					'button',
					{ onClick: () => this.setState({ count: this.state.count + 1 }) },
					`${this.props.label}:${this.state.count}`,
				);
			}
		}
		const ref = React.createRef<ClassCounter>();
		const root = await render(ComponentApp, {
			component: ClassCounter,
			props: { label: 'class', ref },
		});
		const instance = ref.current;
		expect(instance).toBeInstanceOf(ClassCounter);
		await run(() => root.click('button'));
		await run(() =>
			root.update(ComponentApp, { component: ClassCounter, props: { label: 'next', ref } }),
		);
		expect(ref.current).toBe(instance);
		expect(root.find('button').textContent).toBe('next:1');
	});
	it('transports lazy and forwardRef React component roots without invoking them in Octane', async () => {
		const Forwarded = React.forwardRef<HTMLButtonElement, { label: string }>((props, ref) =>
			React.createElement('button', { ref }, props.label),
		);
		const Lazy = React.lazy(async () => ({ default: Forwarded }));
		const ref = React.createRef<HTMLButtonElement>();
		const root = await render(ComponentApp, {
			component: Lazy,
			props: { label: 'lazy forwarded', ref },
		});
		expect(root.find('button').textContent).toBe('lazy forwarded');
		expect(ref.current).toBe(root.find('button'));
	});
	it('projects a new React suspension when an external Octane suspension reveals', async () => {
		const first = deferred();
		first.resolve('initial');
		const root = await render(ExternalResourceApp, { react: first.promise });
		const button = root.find('[data-resource]');
		await run(() => root.click('[data-resource]'));
		const react = deferred();
		const native = deferred();
		const readReactResource = vi.spyOn(react.promise, 'then');
		await run(() =>
			root.update(ExternalResourceApp, { react: react.promise, native: native.promise }),
		);
		expect(root.find('[data-octane-pending]')).toBeTruthy();
		await run(async () => {
			native.resolve('native ready');
			await native.promise;
		});
		// Octane's retry scheduler and React's act queue are independent. Wait
		// for the authored resource to be consumed before checking projection.
		await vi.waitFor(async () => {
			await run(() => {});
			expect(readReactResource).toHaveBeenCalled();
		});
		expect(root.find('[data-octane-pending]')).toBeTruthy();
		await run(async () => {
			react.resolve('both ready');
			await react.promise;
		});
		await vi.waitFor(async () => {
			await run(() => {});
			expect(root.container.querySelector('[data-octane-pending]')).toBeNull();
		});
		expect(root.find('[data-resource]')).toBe(button);
		expect(button.textContent).toBe('both ready:1');
	});
	it('delivers a React Activity cleanup error before a hidden island can discard it', async () => {
		const target = document.createElement('div');
		const log: string[] = [];
		const error = new Error('hidden cleanup failed');
		const root = await render(HiddenErrorApp, { target, log, error, hidden: false });
		await run(() => root.update(HiddenErrorApp, { target, log, error, hidden: true }));
		expect(log).toContain('passive:off');
		await run(() => root.update(HiddenErrorApp, { target, log, error, hidden: true, show: false }));
		expect(root.find('[data-octane-caught]').textContent).toBe('hidden cleanup failed');
	});
});
