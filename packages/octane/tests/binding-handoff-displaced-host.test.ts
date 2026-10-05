import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, hydrateRoot } from 'octane';
import { condition, never } from 'octane/hydration';
import { renderToString } from 'octane/server';
import * as DomBindings from '../src/dom-bindings.js';
import * as DomBindingSignals from '../src/dom-binding-signals.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

// Each early-bound host sits in its own pending boundary, beside an already
// hydrated destination inside the same root (#1745).
const source = `
  import { Hydrate } from 'octane';
  import { unbound } from 'octane/behavior';
  export function Button(props) @{
    'use dom bindings';
    <button data-state={props.label}>{unbound(props.children)}</button>
  }
  export const gates = { a: undefined, b: undefined };
  function readGate(key) { if (gates[key] !== undefined) throw gates[key]; return 'done'; }
  function Gate(props) @{ <i>{readGate(props.id)}</i> }
  export function Parent(props) @{
    <section><aside id="destination"></aside>
      @try { <><Button label={props.label}><span>First</span></Button><Gate id="a" /></> } @pending { <p>waiting a</p> }
      @try { <><Button label={props.label}><span>Second</span></Button><Gate id="b" /></> } @pending { <p>waiting b</p> }
    </section>
  }
  export function Deferred(props) @{
    <section><aside id="destination"></aside>
      <Hydrate when={props.when} split={false}><Button label={props.label}><span>Deferred</span></Button></Hydrate>
    </section>
  }
`;

function fixture(dev: boolean) {
	const id = '/src/displaced-host.tsrx';
	const options = {
		compileOptions: { dev, hmr: false },
		runtimeModules: {
			'octane/behavior': DomBindings,
			'octane/dom-bindings': DomBindings,
			'octane/dom-binding-signals': DomBindingSignals,
		},
	};
	const server = loadCompiledFixtureSource(source, { ...options, id, mode: 'server' });
	const client = loadCompiledFixtureSource(source, { ...options, id, mode: 'client' });
	const descriptor = loadCompiledFixtureSource(source, {
		...options,
		id: id + '?octane-bindings=Button',
		mode: 'client',
	});
	const activation = loadCompiledFixtureSource(
		`
    import { adoptBindings } from 'octane/behavior';
    import { Button } from './displaced-host.tsrx';
    export function attach(root, source) { return adoptBindings(root, Button, source); }
  `,
		{
			...options,
			id: '/src/displaced-host-activate.tsrx',
			mode: 'client',
			runtimeModules: {
				...options.runtimeModules,
				'./displaced-host.tsrx?octane-bindings=Button': descriptor,
			},
		},
	);
	return {
		server,
		client,
		attach: activation.attach as (
			root: Element,
			source: {
				getSnapshot(): { label: string };
				subscribe(notify: () => void): () => void;
			},
		) => DomBindings.BindingHandle,
	};
}

function gate() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => (release = resolve));
	return { promise, release };
}

describe.each([{ dev: false }, { dev: true }])(
	'displaced early host handoff (dev=$dev)',
	({ dev }) => {
		let root: ReturnType<typeof hydrateRoot> | undefined;
		let bindings: DomBindings.BindingHandle[] = [];
		let container: HTMLElement | undefined;
		afterEach(() => {
			root?.unmount();
			root = undefined;
			for (const binding of bindings) binding.dispose();
			bindings = [];
			container?.remove();
			container = undefined;
			vi.restoreAllMocks();
		});

		/** Server-render, adopt both hosts early, and hydrate with both boundaries pending. */
		async function setup(onFirstCleanup?: (buttons: HTMLButtonElement[]) => void) {
			const view = fixture(dev);
			const props = { label: 'ready' };
			let snapshot = props;
			container = document.createElement('div');
			document.body.append(container);
			container.innerHTML = renderToString(view.server.Parent, props).html;
			const buttons = [...container.querySelectorAll('button')];
			const destination = container.querySelector('#destination')!;
			const notify: Array<() => void> = [];
			const cleanups = [vi.fn(() => onFirstCleanup?.(buttons)), vi.fn()];
			bindings = buttons.map((button, index) =>
				view.attach(button, {
					getSnapshot: () => snapshot,
					subscribe(publish) {
						notify[index] = publish;
						return cleanups[index]!;
					},
				}),
			);
			const gates = { a: gate(), b: gate() };
			view.client.gates.a = gates.a.promise;
			view.client.gates.b = gates.b.promise;
			const uncaught = vi.fn();
			const recoverable = vi.fn();
			const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
			root = hydrateRoot(container, view.client.Parent, props, {
				bindingLeases: bindings,
				onUncaughtError: uncaught,
				onRecoverableError: recoverable,
			});
			await act(async () => {});
			return {
				view,
				buttons,
				destination,
				cleanups,
				uncaught,
				recoverable,
				errors,
				/** Settle one boundary's gate, optionally replacing it with another pending read. */
				async resume(key: 'a' | 'b', next?: Promise<void>) {
					view.client.gates[key] = next;
					await act(async () => {
						gates[key].release();
						await gates[key].promise;
					});
				},
				async publish(index: number, label: string) {
					snapshot = { label };
					await act(async () => notify[index]!());
				},
				replacement() {
					return [...container!.querySelectorAll('button')].find(
						(button) => !buttons.includes(button),
					);
				},
			};
		}

		it('hands off an unmoved host when its pending boundary resumes', async () => {
			const run = await setup();
			await run.resume('a');
			await run.resume('b');
			expect(run.replacement()).toBeUndefined();
			expect(run.cleanups[1]).toHaveBeenCalledOnce();
			await run.publish(1, 'late early owner');
			expect(run.buttons[1]!.getAttribute('data-state')).toBe('ready');
			expect(run.recoverable).not.toHaveBeenCalled();
			expect(run.uncaught).not.toHaveBeenCalled();
		});

		it('retires a host that an earlier handoff moved inside the root once its replacement commits', async () => {
			const run = await setup((buttons) => {
				container!.querySelector('#destination')!.append(buttons[1]!);
			});
			await run.resume('a');
			expect(run.cleanups[0]).toHaveBeenCalledOnce();
			expect(run.destination.contains(run.buttons[1]!)).toBe(true);
			// Pending, the moved host's early owner still presents.
			expect(run.cleanups[1]).not.toHaveBeenCalled();
			await run.publish(1, 'pending early owner');
			expect(run.buttons[1]!.getAttribute('data-state')).toBe('pending early owner');

			await run.resume('b');
			const replacement = run.replacement()!;
			expect(replacement).toBeDefined();
			expect(replacement.getAttribute('data-state')).toBe('ready');
			expect(replacement.textContent).toBe('Second');
			expect(run.cleanups[1]).toHaveBeenCalledOnce();
			expect(run.recoverable).toHaveBeenCalledOnce();
			if (dev) expect(run.errors).toHaveBeenCalled();
			expect(run.uncaught).not.toHaveBeenCalled();

			// The moved DOM is preserved and no longer published by either owner.
			expect(run.destination.contains(run.buttons[1]!)).toBe(true);
			await run.publish(1, 'late early owner');
			expect(run.buttons[1]!.getAttribute('data-state')).toBe('pending early owner');
			await act(() => root!.render(run.view.client.Parent, { label: 'updated' }));
			expect(replacement.getAttribute('data-state')).toBe('updated');
			expect(run.buttons[0]!.getAttribute('data-state')).toBe('updated');
			expect(run.buttons[1]!.getAttribute('data-state')).toBe('pending early owner');
			expect(run.cleanups[1]).toHaveBeenCalledOnce();
		});

		it('keeps a moved host live until a resumed attempt that suspends again commits', async () => {
			const run = await setup();
			await run.resume('a');
			run.destination.append(run.buttons[1]!);
			const again = gate();
			await run.resume('b', again.promise);
			expect(run.replacement()).toBeUndefined();
			expect(run.cleanups[1]).not.toHaveBeenCalled();
			await run.publish(1, 'pending early owner');
			expect(run.buttons[1]!.getAttribute('data-state')).toBe('pending early owner');

			run.view.client.gates.b = undefined;
			await act(async () => {
				again.release();
				await again.promise;
			});
			expect(run.replacement()?.getAttribute('data-state')).toBe('ready');
			expect(run.cleanups[1]).toHaveBeenCalledOnce();
			await run.publish(1, 'late early owner');
			expect(run.buttons[1]!.getAttribute('data-state')).toBe('pending early owner');
			expect(run.destination.contains(run.buttons[1]!)).toBe(true);
			expect(run.uncaught).not.toHaveBeenCalled();
		});

		it('retires a host moved out of a dormant Hydrate boundary once its activation commits', async () => {
			const view = fixture(dev);
			const props = { label: 'ready', when: never() };
			let snapshot = { label: 'ready' };
			let notify!: () => void;
			const cleanup = vi.fn();
			container = document.createElement('div');
			document.body.append(container);
			container.innerHTML = renderToString(view.server.Deferred, props).html;
			const button = container.querySelector('button')!;
			const destination = container.querySelector('#destination')!;
			bindings = [
				view.attach(button, {
					getSnapshot: () => snapshot,
					subscribe(publish) {
						notify = publish;
						return cleanup;
					},
				}),
			];
			const uncaught = vi.fn();
			vi.spyOn(console, 'error').mockImplementation(() => {});
			root = hydrateRoot(container, view.client.Deferred, props, {
				bindingLeases: bindings,
				onUncaughtError: uncaught,
			});
			await act(async () => {});
			destination.append(button);
			snapshot = { label: 'pending early owner' };
			await act(async () => notify());
			expect(button.getAttribute('data-state')).toBe('pending early owner');
			expect(cleanup).not.toHaveBeenCalled();

			await act(() =>
				root!.render(view.client.Deferred, { label: 'ready', when: condition(true) }),
			);
			const replacement = [...container.querySelectorAll('button')].find((node) => node !== button);
			expect(replacement?.getAttribute('data-state')).toBe('ready');
			expect(cleanup).toHaveBeenCalledOnce();
			snapshot = { label: 'late early owner' };
			await act(async () => notify());
			expect(button.getAttribute('data-state')).toBe('pending early owner');
			expect(destination.contains(button)).toBe(true);
			expect(uncaught).not.toHaveBeenCalled();
		});

		it('retires a moved host whose site now holds an external clone', async () => {
			const run = await setup();
			await run.resume('a');
			const clone = run.buttons[1]!.cloneNode(true) as HTMLButtonElement;
			run.buttons[1]!.replaceWith(clone);
			run.destination.append(run.buttons[1]!);
			await run.resume('b');
			// Hydration adopts the clone that occupies the site, not the moved host.
			expect(run.replacement()).toBe(clone);
			expect(run.cleanups[1]).toHaveBeenCalledOnce();
			await run.publish(1, 'late early owner');
			expect(run.buttons[1]!.getAttribute('data-state')).toBe('ready');
			await act(() => root!.render(run.view.client.Parent, { label: 'updated' }));
			expect(clone.getAttribute('data-state')).toBe('updated');
			expect(run.buttons[1]!.getAttribute('data-state')).toBe('ready');
			expect(run.destination.contains(run.buttons[1]!)).toBe(true);
			expect(run.uncaught).not.toHaveBeenCalled();
		});
	},
);
