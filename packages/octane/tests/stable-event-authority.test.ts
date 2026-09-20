import { AsyncLocalStorage } from 'node:async_hooks';
import { expect, it, vi } from 'vitest';
import {
	act,
	createElement,
	createRoot,
	flushSync,
	hostComponent,
	startTransition,
	ViewTransition,
	type ComponentBody,
} from '../src/index.js';
import {
	createScope,
	currentSignalOwner,
	installSignalOwnerEnvironment,
	runWithSignalOwner,
	type SignalOwner,
} from '../src/signals/index.js';
import { installViewTransitionMocks } from './conformance/_helpers/view-transition-mocks.js';

it('publishes queued owner B then A against the latest authority, including committed A', async () => {
	const storage = new AsyncLocalStorage<SignalOwner>();
	const restoreCarrier = installSignalOwnerEnvironment({
		current: () => storage.getStore() ?? null,
		run: (owner, callback) => storage.run(owner, callback),
		capture: (owner) => (callback) => storage.run(owner, callback),
	});
	const mocks = installViewTransitionMocks();
	const ownerA = createScope({ scopeKey: 'staged-same-owner-a' });
	const ownerB = createScope({ scopeKey: 'staged-same-owner-b' });
	const host = document.createElement('div');
	document.body.append(host);
	const root = createRoot(host);
	const seen: { phase: string; owner: SignalOwner | null }[] = [];
	let publish: (() => void | Promise<void>) | undefined;
	let release!: () => void;
	const done = new Promise<void>((resolve) => {
		release = resolve;
	});
	document.startViewTransition = ((input: { update: () => void | Promise<void> }) => {
		publish = input.update;
		return { ready: done, finished: done, skipTransition() {} };
	}) as typeof document.startViewTransition;
	const Host: ComponentBody<{ phase: string }> = ({ phase }, scope) => {
		// hostComponent is the public primitive used by motion-style host wrappers.
		// Its ordered property reads change the installed public owner carrier.
		hostComponent(scope, 0, 'button', {
			get onClick() {
				storage.enterWith(phase === 'after' ? ownerB : ownerA);
				return () => seen.push({ phase, owner: currentSignalOwner() });
			},
			get onMouseDown() {
				storage.enterWith(ownerA);
				return () => seen.push({ phase, owner: currentSignalOwner() });
			},
			title: phase,
		});
	};
	const view = (phase: string) =>
		createElement(ViewTransition, {
			name: 'ordered-event-owner',
			children: createElement('section', null, createElement(Host, { phase })),
		});
	try {
		await act(() => run(ownerA, () => root.render(view('before'))));
		const button = host.querySelector('button')!;
		button.click();
		expect(seen).toEqual([{ phase: 'before', owner: ownerA }]);
		run(ownerA, () => startTransition(() => root.render(view('after'))));
		await vi.waitFor(() => expect(publish).toBeTypeOf('function'));
		expect(host.querySelector('button')).toBe(button);
		expect(button.title).toBe('before');
		button.click();
		expect(seen.at(-1)).toEqual({ phase: 'before', owner: ownerA });
		await publish!();
		expect(host.querySelector('button')).toBe(button);
		expect(button.title).toBe('after');
		button.click();
		expect(seen.at(-1)).toEqual({ phase: 'after', owner: ownerA });
		button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		expect(seen.at(-1)).toEqual({ phase: 'after', owner: ownerA });
		release();
		await act(() => done);
	} finally {
		release();
		flushSync(() => root.unmount());
		await Promise.resolve();
		expect(host.childNodes.length).toBe(0);
		ownerA.dispose();
		ownerB.dispose();
		host.remove();
		mocks.restore();
		restoreCarrier();
	}
	function run<T>(owner: SignalOwner, callback: () => T): T {
		return storage.run(owner, callback);
	}
});

it('refreshes authority for public host-wrapper updates outside rendering', () => {
	const ownerA = createScope({ scopeKey: 'outside-host-owner-a' });
	const ownerB = createScope({ scopeKey: 'outside-host-owner-b' });
	const host = document.createElement('div');
	document.body.append(host);
	const root = createRoot(host);
	const seen: { phase: string; owner: SignalOwner | null }[] = [];
	let update: ((phase: string) => void) | undefined;
	const Host: ComponentBody = (_props, scope) => {
		update = (phase) =>
			hostComponent(scope, 0, 'button', {
				title: phase,
				onClick: () => seen.push({ phase, owner: currentSignalOwner() }),
			});
		update('initial');
	};
	try {
		runWithSignalOwner(ownerA, () => root.render(Host, {}));
		const button = host.querySelector('button')!;
		for (const [phase, owner] of [
			['same', ownerA],
			['other', ownerB],
			['returned', ownerA],
		] as const) {
			runWithSignalOwner(owner, () => update!(phase));
			expect(host.querySelector('button')).toBe(button);
			expect(button.title).toBe(phase);
			button.click();
			expect(seen.at(-1)).toEqual({ phase, owner });
		}
	} finally {
		root.unmount();
		update = undefined;
		expect(host.childNodes.length).toBe(0);
		ownerA.dispose();
		ownerB.dispose();
		host.remove();
	}
});
