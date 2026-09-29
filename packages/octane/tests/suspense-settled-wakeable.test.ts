import { describe, expect, it } from 'vitest';
import { startTransition } from '../src/index.js';
import { act, mount } from './_helpers';
import {
	SettledHiddenActivity,
	SettledJsxBoundary,
	SettledRoot,
	SettledTemplateBoundary,
	SettledUseBoundary,
} from './_fixtures/settled-wakeable.tsrx';

// A retry that re-suspends on an already-settled wakeable must yield to the
// event loop, as React's Scheduler ping does. Retrying on the settled
// wakeable's own microtask would starve every timer and network callback,
// including the one that ends the suspension. That loop also starves Vitest's
// timeout, so each gate opens itself after STARVED_AFTER checks and records it.
const STARVED_AFTER = 2_000;

interface Gate {
	open: boolean;
	checks: number;
	starved: boolean;
	check(): boolean;
	read(): string;
}

function settledGate(wakeable: object, value = 'ready'): Gate {
	const gate: Gate = {
		open: false,
		checks: 0,
		starved: false,
		check() {
			gate.checks++;
			if (!gate.open && gate.checks === STARVED_AFTER) {
				gate.starved = true;
				gate.open = true;
			}
			return gate.open;
		},
		read() {
			if (!gate.check()) throw wakeable;
			return value;
		},
	};
	return gate;
}

function nextTask(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Opens the gate from a timer, the state change a microtask loop never lets run. */
async function openFromTimer(gate: Gate): Promise<void> {
	await new Promise<void>((resolve) =>
		setTimeout(() => {
			gate.open = true;
			resolve();
		}, 0),
	);
	await nextTask();
}

async function drainMicrotasks(): Promise<void> {
	for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe('Suspense retries on an already-settled wakeable', () => {
	describe.each([
		['template', SettledTemplateBoundary],
		['JSX', SettledJsxBoundary],
	] as const)('through a %s boundary', (_name, App) => {
		it('lets a timer end a suspension on a thrown resolved promise', async () => {
			const gate = settledGate(Promise.resolve());
			const r = mount(App, { read: gate.read });
			expect(r.find('.fallback').textContent).toBe('loading');
			await act(() => openFromTimer(gate));
			expect(gate.starved).toBe(false);
			expect(r.find('.resolved').textContent).toBe('ready');
			expect(r.findAll('.fallback')).toHaveLength(0);
			r.unmount();
		});

		it('lets a timer end a suspension on a thrown rejected promise', async () => {
			const rejected = Promise.reject(new Error('stale'));
			rejected.catch(() => {});
			const gate = settledGate(rejected);
			const r = mount(App, { read: gate.read });
			await act(() => openFromTimer(gate));
			expect(gate.starved).toBe(false);
			expect(r.find('.resolved').textContent).toBe('ready');
			r.unmount();
		});
	});

	it('paces use() of a thenable whose status React does not recognize', async () => {
		// router-core's controlled promises report `status: 'resolved'`. use()
		// treats an unrecognized status as pending without instrumenting it,
		// exactly like React's trackUsedThenable, so this read stays suspended.
		const thenable = Object.assign(Promise.resolve('value'), { status: 'resolved' });
		const gate = settledGate(thenable);
		const r = mount(SettledUseBoundary, { ready: gate.check, thenable });
		expect(r.find('.fallback').textContent).toBe('loading');
		await act(() => openFromTimer(gate));
		expect(gate.starved).toBe(false);
		expect(r.find('.resolved').textContent).toBe('ready');
		expect(thenable.status).toBe('resolved');
		r.unmount();
	});

	it('lets a timer end an initial root suspension without a boundary', async () => {
		const gate = settledGate(Promise.resolve());
		const r = mount(SettledRoot, { read: gate.read });
		expect(r.container.innerHTML).toBe('');
		await act(() => openFromTimer(gate));
		expect(gate.starved).toBe(false);
		expect(r.find('.resolved').textContent).toBe('ready');
		r.unmount();
	});

	it.each([
		['boundary', SettledTemplateBoundary],
		['root', SettledRoot],
	] as const)('keeps a %s transition held until a timer ends it', async (_name, App) => {
		const r = mount(App, { read: () => 'initial' });
		const gate = settledGate(Promise.resolve(), 'next');
		await act(async () => {
			startTransition(() => r.root.render(App, { read: gate.read }));
			await Promise.resolve();
			expect(r.find('.resolved').textContent).toBe('initial');
			await openFromTimer(gate);
		});
		expect(gate.starved).toBe(false);
		expect(r.find('.resolved').textContent).toBe('next');
		r.unmount();
	});

	it('lets a timer end a suspension inside hidden Activity', async () => {
		const gate = settledGate(Promise.resolve());
		const r = mount(SettledHiddenActivity, { read: gate.read, mode: 'hidden' });
		await act(() => openFromTimer(gate));
		expect(gate.starved).toBe(false);
		r.update(SettledHiddenActivity, { read: gate.read, mode: 'visible' });
		await act(async () => {});
		expect(r.find('.resolved').textContent).toBe('ready');
		r.unmount();
	});

	it('waits for a reusable custom wakeable to notify again instead of polling', async () => {
		const listeners: Array<() => void> = [];
		const wakeable = { then: (notify: () => void) => void listeners.push(notify) };
		const gate = settledGate(wakeable);
		const r = mount(SettledTemplateBoundary, { read: gate.read });
		await act(async () => {
			listeners.shift()!();
		});
		// The retry re-subscribed and suspended again. Nothing polls it meanwhile.
		const checks = gate.checks;
		expect(listeners).toHaveLength(1);
		for (let i = 0; i < 5; i++) await nextTask();
		expect(gate.checks).toBe(checks);
		expect(r.find('.fallback').textContent).toBe('loading');
		await act(async () => {
			gate.open = true;
			listeners.shift()!();
			await nextTask();
		});
		expect(r.find('.resolved').textContent).toBe('ready');
		r.unmount();
	});
});

describe('Suspense retries on a wakeable that settles for the first time', () => {
	it('still retries on microtasks when an already-resolved promise is first thrown', async () => {
		const cached = Promise.resolve('cached');
		let ready = false;
		void cached.then(() => {
			ready = true;
		});
		const r = mount(SettledRoot, {
			read: () => {
				if (!ready) throw cached;
				return 'cached';
			},
		});
		expect(r.container.innerHTML).toBe('');
		await drainMicrotasks();
		expect(r.find('.resolved').textContent).toBe('cached');
		r.unmount();
	});

	it('retries every root suspended on one pending promise on microtasks', async () => {
		let resolve!: () => void;
		const shared = new Promise<void>((done) => {
			resolve = done;
		});
		let ready = false;
		void shared.then(() => {
			ready = true;
		});
		const read = () => {
			if (!ready) throw shared;
			return 'shared';
		};
		const first = mount(SettledRoot, { read });
		const second = mount(SettledRoot, { read });
		resolve();
		await drainMicrotasks();
		expect(first.find('.resolved').textContent).toBe('shared');
		expect(second.find('.resolved').textContent).toBe('shared');
		first.unmount();
		second.unmount();
	});
});
