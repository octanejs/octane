import { describe, expect, it } from 'vitest';
import { act, hydrateRoot } from '../../src/index.js';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

const EVENT_CASES = [
	[
		'direct',
		'',
		'<button data-action onClick={props.onAction}>{value as string}</button>',
		'click',
	],
	[
		'bundled',
		'const invoke = props.onAction;',
		'<button data-action onClick={() => invoke()}>{value as string}</button>',
		'click',
	],
	['spread', '', '<button data-action {...props.handlers}>{value as string}</button>', 'click'],
	[
		'custom',
		'',
		'<x-control data-action onpulse={props.onAction}>{value as string}</x-control>',
		'pulse',
	],
] as const;

function sourceForHost(setup: string, host: string) {
	return `function Later(props) @{ <output>{props.read()}</output>; }
export function Gate(props) @{
  @try { const value = props.read(); ${setup} <section>${host}<Later read={props.later} /></section>; }
  @pending { <p>Loading</p>; }
}`;
}

function synchronousBlocker() {
	// Waking inside native capture keeps the same event in flight through the retry.
	const subscribers: Array<() => void> = [];
	const promise = {
		then(callback: () => void) {
			subscribers.push(callback);
		},
	};
	return {
		pending: false,
		promise,
		resolve: () => subscribers.splice(0).forEach((callback) => callback()),
	};
}

function asynchronousBlocker() {
	let resolve!: () => void;
	const promise = new Promise<void>((callback) => (resolve = callback));
	return { pending: false, promise, resolve };
}

function loadGate(source: string, dev: boolean, mode: 'client' | 'server') {
	return loadCompiledFixtureSource(source, {
		id: '/gate.tsrx',
		mode,
		compileOptions: { dev, hmr: false },
	})['Gate'];
}

describe.each([false, true])('in-flight hydration events (dev: %s)', (dev) => {
	it.each(EVENT_CASES)(
		'delivers the existing event once to an accepted %s listener',
		(_kind, setup, host, eventType) => {
			const source = sourceForHost(setup, host);
			const first = synchronousBlocker();
			let calls = 0;
			const onAction = () => calls++;
			const props = {
				read: () => {
					if (first.pending) throw first.promise;
					return 'ready';
				},
				later: () => 'later',
				onAction,
				handlers: { onClick: onAction },
			};
			const container = document.createElement('div');
			document.body.append(container);
			container.innerHTML = renderToString(loadGate(source, dev, 'server'), props).html;
			const target = container.querySelector('[data-action]')!;
			container.addEventListener(
				eventType,
				() => {
					first.pending = false;
					first.resolve();
				},
				{ capture: true, once: true },
			);
			first.pending = true;
			const root = hydrateRoot(container, loadGate(source, dev, 'client'), props);
			try {
				target.dispatchEvent(new Event(eventType, { bubbles: true }));
				expect(container.querySelector('[data-action]')).toBe(target);
				expect(calls).toBe(1);
			} finally {
				root.unmount();
				container.remove();
			}
		},
	);

	it('retains native listener identity when hydration accepts', async () => {
		const source = `export function Gate(props) @{
  @try { const value = props.read(); <x-control data-action onpulse={props.onAction}>{value as string}</x-control>; }
  @pending { <p>Loading</p>; }
}`;
		const first = asynchronousBlocker();
		let calls = 0;
		const onAction = () => calls++;
		const props = {
			read: () => {
				if (first.pending) throw first.promise;
				return 'ready';
			},
			onAction,
		};
		const container = document.createElement('div');
		document.body.append(container);
		container.innerHTML = renderToString(loadGate(source, dev, 'server'), props).html;
		const target = container.querySelector('[data-action]')!;
		// EventTarget deduplicates matching native listener identities.
		target.addEventListener('pulse', onAction);
		first.pending = true;
		const root = hydrateRoot(container, loadGate(source, dev, 'client'), props);
		try {
			first.pending = false;
			await act(() => first.resolve());
			expect(container.querySelector('[data-action]')).toBe(target);
			target.dispatchEvent(new Event('pulse'));
			expect(calls).toBe(1);
			target.removeEventListener('pulse', onAction);
			target.dispatchEvent(new Event('pulse'));
			expect(calls).toBe(1);
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it.each(['replace', 'remove'] as const)(
		'uses the final native listener after a render-phase %s',
		async (outcome) => {
			const source = `import { useState } from 'octane';
function Host(props) @{
  const [phase, setPhase] = useState(0);
  <x-control data-action onpulse={phase === 0 ? props.first : props.final}>{(props.rerun && phase === 0 ? (setPhase(1), 'ready') : 'ready') as string}</x-control>;
}
export function Gate(props) @{
  @try { props.read(); <Host first={props.first} final={props.final} rerun={props.rerun} />; }
  @pending { <p>Loading</p>; }
}`;
			const waiting = asynchronousBlocker();
			const observed: string[] = [];
			const props = {
				read: () => {
					if (waiting.pending) throw waiting.promise;
				},
				first: () => observed.push('first'),
				final: outcome === 'replace' ? () => observed.push('final') : null,
				rerun: false,
			};
			const container = document.createElement('div');
			document.body.append(container);
			container.innerHTML = renderToString(loadGate(source, dev, 'server'), props).html;
			const target = container.querySelector('[data-action]')!;
			waiting.pending = props.rerun = true;
			const root = hydrateRoot(container, loadGate(source, dev, 'client'), props);
			try {
				waiting.pending = false;
				await act(() => waiting.resolve());
				expect(container.querySelector('[data-action]')).toBe(target);
				target.dispatchEvent(new Event('pulse'));
				expect(observed).toEqual(outcome === 'replace' ? ['final'] : []);
			} finally {
				root.unmount();
				container.remove();
			}
		},
	);

	it('preserves custom host registration failure recovery', async () => {
		const source = `export function Gate(props) @{
  @try { const value = props.read(); <x-control data-action onpulse={props.onAction}>{value as string}</x-control>; }
  @pending { <p>Loading</p>; }
  @catch (error) { <p data-catch>{props.capture(error)}</p>; }
}`;
		const first = asynchronousBlocker();
		const failure = new Error('listener rejected');
		const caught: unknown[] = [];
		const recoverable: unknown[] = [];
		const registrations: unknown[] = [];
		const onAction = () => undefined;
		const props = {
			read: () => {
				if (first.pending) throw first.promise;
				return 'ready';
			},
			onAction,
			capture: (error: unknown) => {
				caught.push(error);
				return 'caught';
			},
		};
		const container = document.createElement('div');
		document.body.append(container);
		container.innerHTML = renderToString(loadGate(source, dev, 'server'), props).html;
		const target = container.querySelector('[data-action]')!;
		const add = target.addEventListener;
		target.addEventListener = function (type, listener, options) {
			registrations.push(listener);
			if (type === 'pulse' && listener === onAction) throw failure;
			add.call(this, type, listener, options);
		};
		first.pending = true;
		const root = hydrateRoot(container, loadGate(source, dev, 'client'), props, {
			onRecoverableError: (error) => recoverable.push(error),
		});
		try {
			first.pending = false;
			await act(() => first.resolve());
			expect(registrations).toEqual([onAction]);
			expect(container.querySelector('[data-action]')).not.toBe(target);
			expect(container.querySelector('[data-action]')?.textContent).toBe('ready');
			expect(caught).toEqual([]);
			expect(recoverable).toHaveLength(1);
			expect((recoverable[0] as Error).cause).toBe(failure);
		} finally {
			root.unmount();
			container.remove();
		}
	});

	it.each(EVENT_CASES)(
		'does not deliver an existing event to a discarded %s listener',
		async (_kind, setup, host, eventType) => {
			const source = sourceForHost(setup, host);
			const first = synchronousBlocker();
			const later = asynchronousBlocker();
			let phase = 'initial';
			const observed: string[] = [];
			const onAction = () => observed.push(phase);
			const props = {
				read: () => {
					if (first.pending) throw first.promise;
					return 'ready';
				},
				later: () => {
					if (later.pending) throw later.promise;
					return 'later';
				},
				onAction,
				handlers: { onClick: onAction },
			};
			const container = document.createElement('div');
			document.body.append(container);
			container.innerHTML = renderToString(loadGate(source, dev, 'server'), props).html;
			const target = container.querySelector('[data-action]')!;
			container.addEventListener(
				eventType,
				() => {
					first.pending = false;
					first.resolve();
				},
				{ capture: true, once: true },
			);
			first.pending = later.pending = true;
			const root = hydrateRoot(container, loadGate(source, dev, 'client'), props);
			try {
				phase = 'in-flight';
				target.dispatchEvent(new Event(eventType, { bubbles: true }));
				phase = 'pending';
				target.dispatchEvent(new Event(eventType, { bubbles: true }));
				later.pending = false;
				await act(() => later.resolve());
				expect(container.querySelector('[data-action]')).toBe(target);
				phase = 'committed';
				target.dispatchEvent(new Event(eventType, { bubbles: true }));
				expect(observed).toEqual(['committed']);
			} finally {
				root.unmount();
				container.remove();
			}
		},
	);
});
