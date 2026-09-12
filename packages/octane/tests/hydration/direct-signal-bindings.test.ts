import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	applyHydrationControlCandidate,
	captureHydrationControlCandidate,
	initializeHydrationEventCapture,
	snapshotHydrationControl,
} from '../../src/hydration/event-capture.js';
import {
	bindSignalChild,
	bindSignalValue,
	childSlot,
	createRoot,
	enableSignalBindings,
	flushSync,
	hydrateRoot,
	type Root,
} from '../../src/runtime.js';
import { renderToString } from '../../src/runtime.server.js';
import * as Signals from '../../src/signals/index.js';
import { loadCompiledFixtureSource } from '../_server-fixture.js';
import {
	__signalAt,
	createScope,
	currentSignalOwner,
	runWithSignalOwner,
} from '../../src/signals/index.js';
import type { SignalOwner } from '../../src/signals/types.js';

describe('direct signal child bindings', () => {
	let root: Root | undefined;

	afterEach(() => {
		root?.unmount();
		root = undefined;
		document.body.textContent = '';
		vi.restoreAllMocks();
	});

	it('discovers a signal passed through an unmarked renderable prop at runtime', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const value$ = __signalAt('g:prop-child', 'prop-child', 'one');
		const Body = (props: { value: unknown }, scope: Parameters<typeof childSlot>[0]) => {
			childSlot(scope, 0, scope.block.parentNode, props.value, scope.block.endMarker);
		};

		root = createRoot(container);
		root.render(Body, { value: value$ });
		expect(container.textContent).toBe('one');
		value$.set('two');
		await Promise.resolve();
		expect(container.textContent).toBe('two');
	});

	it('keeps scalar renderable holes allocation-free and targets signal text updates', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const owner = createScope({ scopeKey: 'direct-child' });
		const text$ = owner.signal$('text', 'signal one');
		let value: unknown = 'scalar';
		let token: unknown;
		const Body = (_props: unknown, scope: Parameters<typeof bindSignalChild>[0]) => {
			token = bindSignalChild(scope, token, 0, scope.block.parentNode, value, 'b:text');
		};

		root = createRoot(container);
		root.render(Body, {});
		expect(container.textContent).toBe('scalar');
		expect(token).toBeNull();

		value = text$;
		root.render(Body, {});
		await Promise.resolve();
		expect(container.textContent).toBe('signal one');
		expect(token).not.toBeNull();

		text$.set('signal two');
		await Promise.resolve();
		expect(container.textContent).toBe('signal two');

		value = 'scalar again';
		root.render(Body, {});
		await Promise.resolve();
		expect(container.textContent).toBe('scalar again');
		expect(token).toBeNull();
		owner.dispose();
	});

	it('publishes an authoritative storage candidate into an active writable binding', () => {
		enableSignalBindings();
		const container = document.createElement('div');
		document.body.appendChild(container);
		const input = document.createElement('input');
		container.appendChild(input);
		const draft$ = __signalAt('g:draft-candidate', 'draft-candidate', 'server');
		let token: unknown;
		let owner: SignalOwner | null = null;
		const Body = (_props: unknown, scope: Parameters<typeof bindSignalValue>[0]) => {
			owner = currentSignalOwner();
			if (!input.isConnected) scope.block.parentNode.insertBefore(input, scope.block.endMarker);
			token = bindSignalValue(scope, token, input, draft$, 'i:draft-control');
		};

		root = createRoot(container);
		root.render(Body, {});
		const candidate = captureHydrationControlCandidate(input)!;
		expect(applyHydrationControlCandidate(candidate, { value: 'stored' })).toBe(true);
		expect(runWithSignalOwner(owner!, () => draft$.get())).toBe('stored');
	});

	it.each(
		[false, true].flatMap((dev) =>
			[false, true].flatMap((hydrate) =>
				[false, true].flatMap((onlyChild) =>
					['', 'initial'].map((initial) => ({ dev, hydrate, onlyChild, initial })),
				),
			),
		),
	)(
		'preserves text and siblings when switching scalar and signal values (%j)',
		async ({ dev, hydrate, onlyChild, initial }) => {
			const source = `export function App(props) @{ <div>${onlyChild ? '' : '<span>A</span>'}{props.value as string}${onlyChild ? '' : '<span>B</span>'}</div> }`;
			const id = `/src/text-value-transitions-${dev}-${hydrate}-${onlyChild}-${initial}.tsrx`;
			const client = loadCompiledFixtureSource(source, {
				id,
				mode: 'client',
				compileOptions: { dev },
			});
			const owner = createScope({ scopeKey: id });
			const a$ = owner.signal$('a', 'alpha');
			const b$ = owner.signal$('b', 'beta');
			const container = document.createElement('div');
			document.body.append(container);
			if (hydrate) {
				const server = loadCompiledFixtureSource(source, {
					id,
					mode: 'server',
					compileOptions: { dev },
				});
				container.innerHTML = renderToString(server.App, { value: initial }).html;
				root = hydrateRoot(container, client.App, { value: initial }, { signalOwner: owner });
			} else {
				root = createRoot(container, { signalOwner: owner });
				root.render(client.App, { value: initial });
			}
			const host = container.querySelector('div')!;
			const siblings = [...host.querySelectorAll('span')];
			const expected = (value: string) => (onlyChild ? value : `A${value}B`);
			expect(host.textContent).toBe(expected(initial));
			flushSync(() => root!.render(client.App, { value: a$ }));
			expect(host.textContent).toBe(expected('alpha'));
			const text = [...host.childNodes].find((node) => node.nodeType === 3)!;
			a$.set('updated');
			await Promise.resolve();
			expect(host.textContent).toBe(expected('updated'));
			flushSync(() => root!.render(client.App, { value: 'scalar' }));
			expect(host.textContent).toBe(expected('scalar'));
			flushSync(() => root!.render(client.App, { value: b$ }));
			expect(host.textContent).toBe(expected('beta'));
			b$.set('final');
			a$.set('obsolete');
			await Promise.resolve();
			expect(host.textContent).toBe(expected('final'));
			expect([...host.childNodes].find((node) => node.nodeType === 3)).toBe(text);
			expect([...host.querySelectorAll('span')]).toEqual(siblings);
			root.unmount();
			root = undefined;
			owner.dispose();
		},
	);

	it.each([false, true])(
		'keeps committed spread subscriptions after an abandoned render (dev=%s)',
		async (dev) => {
			const source = `import { signal$ } from 'octane/signals';
export const a$ = signal$('A'); export const b$ = signal$('B');
export function App(props) @{
  const fields = {title: props.next ? b$ : a$};
  <div><span {...fields}>host</span><p>{props.finish() as string}</p></div>
}`;
			const id = `/src/abandoned-spread-subscriptions-${dev}.tsrx`;
			const client = loadCompiledFixtureSource(source, {
				id,
				mode: 'client',
				compileOptions: { dev },
				runtimeModules: { 'octane/signals': Signals },
			});
			const owner = Object.freeze({ scopeKey: id });
			const container = document.createElement('div');
			document.body.append(container);
			root = createRoot(container, { signalOwner: owner });
			root.render(client.App, { next: false, finish: () => 'ready' });
			const host = container.querySelector('span')!;
			const pending = new Promise(() => {});
			flushSync(() =>
				root!.render(client.App, {
					next: true,
					finish: () => {
						throw pending;
					},
				}),
			);
			expect(container.querySelector('span')).toBe(host);
			expect(host.title).toBe('A');
			runWithSignalOwner(owner, () => client.a$.set('A2'));
			await Promise.resolve();
			expect(host.title).toBe('A2');
			runWithSignalOwner(owner, () => client.b$.set('B2'));
			await Promise.resolve();
			expect(host.title).toBe('A2');
			flushSync(() => root!.render(client.App, { next: true, finish: () => 'ready' }));
			expect(host.title).toBe('B2');
			runWithSignalOwner(owner, () => client.b$.set('B3'));
			await Promise.resolve();
			expect(host.title).toBe('B3');
			runWithSignalOwner(owner, () => client.a$.set('A3'));
			await Promise.resolve();
			expect(host.title).toBe('B3');
		},
	);

	it.each(
		[false, true].flatMap((dev) =>
			[false, true].flatMap((writable) =>
				['value', 'checked'].map((channel) => ({ dev, writable, channel })),
			),
		),
	)(
		'keeps committed native spread control writers after an abandoned render (%j)',
		async ({ dev, writable, channel }) => {
			const source = `import { signal$, derived$ } from 'octane/signals';
export const value$ = signal$(${channel === 'value' ? "'A'" : 'true'});
const readonly$ = derived$(()=>value$.get());
export function App(props) @{
  const fields = {${channel}: props.writable ? value$ : readonly$};
  <div><input ${channel === 'checked' ? 'type="checkbox"' : ''} {...fields}/><p>{props.finish() as string}</p></div>
}`;
			const id = `/src/abandoned-spread-control-${dev}-${writable}-${channel}.tsrx`;
			const client = loadCompiledFixtureSource(source, {
				id,
				mode: 'client',
				compileOptions: { dev },
				runtimeModules: { 'octane/signals': Signals },
			});
			const owner = Object.freeze({ scopeKey: id });
			// A fresh document has no early-capture listener, so native input here
			// must reach the committed control's own listener.
			const isolated = document.implementation.createHTMLDocument('control rollback');
			const container = isolated.createElement('div');
			isolated.body.append(container);
			vi.spyOn(console, 'error').mockImplementation(() => {});
			root = createRoot(container, { signalOwner: owner });
			root.render(client.App, { writable, finish: () => 'ready' });
			const input = container.querySelector('input')!;
			const pending = new Promise(() => {});
			flushSync(() =>
				root!.render(client.App, {
					writable: !writable,
					finish: () => {
						throw pending;
					},
				}),
			);
			expect(container.querySelector('input')).toBe(input);
			if (channel === 'value') input.value = 'typed';
			else input.checked = false;
			input.dispatchEvent(new InputEvent('input', { bubbles: true }));
			expect(runWithSignalOwner(owner, () => client.value$.get())).toBe(
				writable ? (channel === 'value' ? 'typed' : false) : channel === 'value' ? 'A' : true,
			);
			const candidate = captureHydrationControlCandidate(input)!;
			expect(
				applyHydrationControlCandidate(
					candidate,
					channel === 'value' ? { value: 'candidate' } : { checked: true },
				),
			).toBe(true);
			expect(runWithSignalOwner(owner, () => client.value$.get())).toBe(
				writable ? (channel === 'value' ? 'candidate' : true) : channel === 'value' ? 'A' : true,
			);
		},
	);

	it.each(
		[false, true].flatMap((dev) => ['value', 'checked'].map((channel) => ({ dev, channel }))),
	)(
		'keeps edits with their own spread signal when a live control switches handles (%j)',
		async ({ dev, channel }) => {
			const source = `import { signal$ } from 'octane/signals';
export const a$ = signal$(${channel === 'value' ? "'A'" : 'true'});
export const b$ = signal$(${channel === 'value' ? "'B'" : 'true'});
export function App(props) @{
  const fields = {${channel}: props.next ? b$ : a$};
  <input ${channel === 'checked' ? 'type="checkbox"' : ''} {...fields}/>
}`;
			const id = `/src/live-spread-control-${dev}-${channel}.tsrx`;
			const client = loadCompiledFixtureSource(source, {
				id,
				mode: 'client',
				compileOptions: { dev },
				runtimeModules: { 'octane/signals': Signals },
			});
			const owner = Object.freeze({ scopeKey: id });
			const container = document.createElement('div');
			document.body.append(container);
			initializeHydrationEventCapture(document);
			root = createRoot(container, { signalOwner: owner });
			root.render(client.App, { next: false });
			const input = container.querySelector('input')!;
			if (channel === 'value') input.value = 'edited A';
			else input.checked = false;
			input.dispatchEvent(new InputEvent('input', { bubbles: true }));
			expect(runWithSignalOwner(owner, () => client.a$.get())).toBe(
				channel === 'value' ? 'edited A' : false,
			);
			flushSync(() => root!.render(client.App, { next: true }));
			await Promise.resolve();
			expect(container.querySelector('input')).toBe(input);
			expect(runWithSignalOwner(owner, () => client.b$.get())).toBe(
				channel === 'value' ? 'B' : true,
			);
			expect(input[channel as 'value' | 'checked']).toBe(channel === 'value' ? 'B' : true);
			flushSync(() => root!.render(client.App, { next: false }));
			await Promise.resolve();
			expect(input[channel as 'value' | 'checked']).toBe(channel === 'value' ? 'edited A' : false);
		},
	);

	it.each(
		[false, true].flatMap((dev) =>
			[false, true].flatMap((spread) =>
				['input', 'textarea', 'select', 'checkbox'].map((tag) => ({ dev, spread, tag })),
			),
		),
	)(
		'recognizes only live writable control handlers in diagnostics (%j)',
		async ({ dev, spread, tag }) => {
			const channel = tag === 'checkbox' ? 'checked' : 'value';
			const attrs = `${tag === 'checkbox' ? 'type="checkbox" ' : ''}data-mode={props.mode} ${spread ? '{...fields}' : `${channel}={handle}`}`;
			const element =
				tag === 'select'
					? `<select ${attrs}><option value="server">Server</option><option value="changed">Changed</option></select>`
					: `<${tag === 'checkbox' ? 'input' : tag} ${attrs} />`;
			const source = `import { signal$, derived$ } from 'octane/signals';
export const value$ = signal$(${tag === 'checkbox' ? 'true' : "'server'"});
const readonly$ = derived$(() => value$.get());
export function App(props) @{
  const handle = props.mode === 'writable' ? value$ : props.mode === 'readonly' ? readonly$ : value$.get();
  const fields = {${channel}: handle};
  ${element}
}`;
			const options = {
				id: `/src/signal-control-diagnostic-${dev}-${spread}-${tag}.tsrx`,
				compileOptions: { dev },
				runtimeModules: { 'octane/signals': Signals },
			};
			const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const container = document.createElement('div');
			document.body.append(container);
			const owner = Object.freeze({ scopeKey: options.id });
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			const warnings = () =>
				error.mock.calls.filter((call) =>
					String(call[0]).includes('will render a read-only field'),
				);
			try {
				root = createRoot(container, { signalOwner: owner });
				root.render(client.App, { mode: 'writable' });
				await Promise.resolve();
				expect(warnings()).toHaveLength(0);
				const control = container.firstElementChild as HTMLInputElement;
				if (channel === 'checked') control.checked = false;
				else control.value = 'changed';
				control.dispatchEvent(new InputEvent('input', { bubbles: true }));
				expect(runWithSignalOwner(owner, () => client.value$.get())).toBe(
					channel === 'checked' ? false : 'changed',
				);
				root.render(client.App, { mode: 'readonly' });
				await expect.poll(() => control.getAttribute('data-mode')).toBe('readonly');
				expect(warnings()).toHaveLength(dev ? 1 : 0);
				error.mockClear();
				root.render(client.App, { mode: 'writable' });
				await expect.poll(() => control.getAttribute('data-mode')).toBe('writable');
				expect(warnings()).toHaveLength(0);
				root.render(client.App, { mode: 'snapshot' });
				await expect.poll(() => control.getAttribute('data-mode')).toBe('snapshot');
				expect(warnings()).toHaveLength(dev ? 1 : 0);
			} finally {
				error.mockRestore();
			}
		},
	);

	it.each([false, true])(
		'hydrates adjacent direct signal text without replacing hosts (dev=%s)',
		async (dev) => {
			const source = `import { signal$ } from 'octane/signals';
export const first$ = signal$('one');
export const last$ = signal$('two');
export function App() @{ <div><p>Prefix {first$} suffix</p><p>{first$}{last$}</p><p>{first$} + {last$}</p></div> }`;
			const id = `/src/adjacent-signal-text-${dev}.tsrx`;
			const options = {
				id,
				compileOptions: { dev },
				runtimeModules: { 'octane/signals': Signals },
			};
			const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
			const container = document.createElement('div');
			container.innerHTML = renderToString(server.App, {}).html;
			document.body.append(container);
			const hosts = [...container.querySelectorAll('p')];
			const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const owner = Object.freeze({ scopeKey: id });
			root = hydrateRoot(container, client.App, {}, { signalOwner: owner });
			expect([...container.querySelectorAll('p')]).toEqual(hosts);
			expect(hosts.map((host) => host.textContent)).toEqual([
				'Prefix one suffix',
				'onetwo',
				'one + two',
			]);
			runWithSignalOwner(owner, () => client.first$.set(''));
			await Promise.resolve();
			expect(hosts.map((host) => host.textContent)).toEqual(['Prefix  suffix', 'two', ' + two']);
			runWithSignalOwner(owner, () => {
				client.first$.set('next');
				client.last$.set('last');
			});
			await Promise.resolve();
			expect(hosts.map((host) => host.textContent)).toEqual([
				'Prefix next suffix',
				'nextlast',
				'next + last',
			]);
		},
	);

	it.each([false, true].flatMap((dev) => [null, true].map((initial) => ({ dev, initial }))))(
		'diagnoses the resolved selected signal value (%j)',
		async ({ dev, initial }) => {
			const source = `import { signal$ } from 'octane/signals';
export const selected$ = signal$(${JSON.stringify(initial)});
export function App() @{ <select><option value="first">First</option><option value="second" selected={selected$}>Second</option></select> }`;
			const id = `/src/selected-signal-diagnostic-${dev}-${initial}.tsrx`;
			const client = loadCompiledFixtureSource(source, {
				id,
				mode: 'client',
				compileOptions: { dev },
				runtimeModules: { 'octane/signals': Signals },
			});
			const container = document.createElement('div');
			document.body.append(container);
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			const owner = Object.freeze({ scopeKey: id });
			root = createRoot(container, { signalOwner: owner });
			root.render(client.App, {});
			await Promise.resolve();
			expect((container.firstElementChild as HTMLSelectElement).value).toBe(
				initial ? 'second' : 'first',
			);
			expect(
				error.mock.calls.filter((call) =>
					String(call[0]).includes('`value` or `defaultValue` on <select>'),
				),
			).toHaveLength(dev && initial !== null ? 1 : 0);
			runWithSignalOwner(owner, () => client.selected$.set(true));
			await Promise.resolve();
			expect((container.firstElementChild as HTMLSelectElement).value).toBe('second');
		},
	);

	it.each(
		[false, true].flatMap((dev) =>
			[false, true].flatMap((spread) =>
				[false, true].flatMap((live) => ['early', ''].map((edit) => ({ dev, spread, live, edit }))),
			),
		),
	)(
		'adopts an early edit without writing during render (%j)',
		async ({ dev, spread, live, edit }) => {
			const source = `import { signal$, derived$ } from 'octane/signals';
export const draft$ = signal$('server');
export const readonly$ = signal$('fixed');
const count$ = derived$(() => draft$.get().length);
export function App() @{
  const fields = {value: draft$, 'aria-label': 'Message'};
  <div>${spread ? '<input {...fields} />' : '<input aria-label="Message" value={draft$} />'}<input aria-label="Read only" value={readonly$.get()} readOnly /><p>{'Characters: ' + count$.get()}</p></div>
}`;
			const options = {
				id: `/src/early-edit-adoption-${dev}-${spread}-${live}-${edit.length}.tsrx`,
				compileOptions: { dev },
				runtimeModules: { 'octane/signals': Signals },
			};
			const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
			const container = document.createElement('div');
			container.innerHTML = renderToString(server.App, {}).html;
			document.body.appendChild(container);
			const input = container.querySelector('input')!;
			const readonly = container.querySelectorAll('input')[1];
			const owner = Object.freeze({ scopeKey: options.id });
			const client = live
				? loadCompiledFixtureSource(source, { ...options, mode: 'client' })
				: null;
			if (client !== null)
				expect(runWithSignalOwner(owner, () => client.draft$.get())).toBe('server');
			initializeHydrationEventCapture(document);
			input.focus();
			input.value = edit;
			input.setSelectionRange(Math.min(1, edit.length), Math.min(3, edit.length), 'backward');
			input.dispatchEvent(new InputEvent('input', { bubbles: true }));
			readonly.value = 'ignored edit';
			readonly.dispatchEvent(new InputEvent('input', { bubbles: true }));
			const loaded = client ?? loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const error = vi.spyOn(console, 'error');
			root = hydrateRoot(container, loaded.App, {}, { signalOwner: owner });
			expect(container.querySelector('input')).toBe(input);
			expect(input.value).toBe(edit);
			expect(document.activeElement).toBe(input);
			expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([
				Math.min(1, edit.length),
				Math.min(3, edit.length),
				'backward',
			]);
			await expect
				.poll(() => container.querySelector('p')?.textContent)
				.toBe(`Characters: ${edit.length}`);
			expect(runWithSignalOwner(owner, () => loaded.draft$.get())).toBe(edit);
			expect(runWithSignalOwner(owner, () => loaded.readonly$.get())).toBe('fixed');
			expect(snapshotHydrationControl(input)?.editRevision).toBe(0);
			input.value = '';
			input.dispatchEvent(new InputEvent('input', { bubbles: true }));
			await expect.poll(() => container.querySelector('p')?.textContent).toBe('Characters: 0');
			expect(
				error.mock.calls.filter((call) =>
					String(call[0]).includes('will render a read-only field'),
				),
			).toHaveLength(0);
		},
	);

	it.each([false, true])(
		'hydrates nonvoid spread children and keeps signal children live (dev=%s)',
		async (dev) => {
			const source = `import { signal$ } from 'octane/signals';
export const child$ = signal$('first');
export function App() @{
  const scalar = {children: 'ordinary'};
  const reactive = {children: child$};
  <main><div {...scalar} /><section {...reactive} /></main>
}`;
			const options = {
				id: `/src/spread-children-${dev}.tsrx`,
				compileOptions: { dev },
				runtimeModules: { 'octane/signals': Signals },
			};
			const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
			const container = document.createElement('div');
			container.innerHTML = renderToString(server.App, {}).html;
			document.body.appendChild(container);
			const scalar = container.querySelector('div')!;
			const reactive = container.querySelector('section')!;
			const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const owner = Object.freeze({ scopeKey: options.id });
			root = hydrateRoot(container, client.App, {}, { signalOwner: owner });
			expect(container.querySelector('div')).toBe(scalar);
			expect(container.querySelector('section')).toBe(reactive);
			expect(scalar.textContent).toBe('ordinary');
			expect(reactive.textContent).toBe('first');
			runWithSignalOwner(owner, () => client.child$.set('second'));
			await expect.poll(() => reactive.textContent).toBe('second');
			expect(scalar.textContent).toBe('ordinary');
			runWithSignalOwner(owner, () => client.child$.set(['list', 'items']));
			await expect.poll(() => reactive.textContent).toBe('listitems');
			runWithSignalOwner(owner, () => client.child$.set(''));
			await expect.poll(() => reactive.textContent).toBe('');
			runWithSignalOwner(owner, () => client.child$.set('after list'));
			await expect.poll(() => reactive.textContent).toBe('after list');
			expect(container.querySelector('section')).toBe(reactive);
		},
	);

	it.each([false, true])(
		'hydrates a markerless native-read number without replacing its host (dev=%s)',
		async (dev) => {
			const source = `import { signal$ } from 'octane/signals';
export const value$ = signal$(1);
export function App() @{ <div><p>{value$.get() as number}</p></div> }`;
			const options = {
				id: `/src/markerless-native-number-${dev}.tsrx`,
				compileOptions: { dev },
				runtimeModules: { 'octane/signals': Signals },
			};
			const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
			const container = document.createElement('div');
			container.innerHTML = renderToString(server.App, {}).html;
			document.body.appendChild(container);
			const paragraph = container.querySelector('p')!;
			const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const owner = Object.freeze({ scopeKey: options.id });
			root = hydrateRoot(container, client.App, {}, { signalOwner: owner });
			expect(container.querySelector('p')).toBe(paragraph);
			expect(paragraph.textContent).toBe('1');
			runWithSignalOwner(owner, () => client.value$.set(2));
			await expect.poll(() => paragraph.textContent).toBe('2');
			expect(container.querySelector('p')).toBe(paragraph);
		},
	);

	it.each([false, true])(
		'switches markerless spread children from scalar to signal and back (dev=%s)',
		async (dev) => {
			const source = `import { signal$ } from 'octane/signals';
export const child$ = signal$('signal');
export function App(props) @{ <main><section {...props.fields} /></main> }`;
			const options = {
				id: `/src/spread-child-mode-${dev}.tsrx`,
				compileOptions: { dev },
				runtimeModules: { 'octane/signals': Signals },
			};
			const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
			const container = document.createElement('div');
			container.innerHTML = renderToString(server.App, { fields: { children: 'scalar' } }).html;
			document.body.appendChild(container);
			const section = container.querySelector('section')!;
			const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const owner = Object.freeze({ scopeKey: options.id });
			root = hydrateRoot(
				container,
				client.App,
				{ fields: { children: 'scalar' } },
				{ signalOwner: owner },
			);
			expect(section.textContent).toBe('scalar');
			root.render(client.App, { fields: { children: client.child$ } });
			await expect.poll(() => section.textContent).toBe('signal');
			runWithSignalOwner(owner, () => client.child$.set('changed'));
			await expect.poll(() => section.textContent).toBe('changed');
			root.render(client.App, { fields: { children: 'ordinary again' } });
			await expect.poll(() => section.textContent).toBe('ordinary again');
			runWithSignalOwner(owner, () => client.child$.set('detached'));
			await Promise.resolve();
			expect(section.textContent).toBe('ordinary again');
			expect(container.querySelector('section')).toBe(section);
		},
	);

	it.each([false, true])(
		'keeps a newer native edit authoritative during publication (spread=%s)',
		async (spread) => {
			const source = `import { signal$, derived$ } from 'octane/signals';
export const draft$ = signal$('server');
const count$ = derived$(() => draft$.get().length);
export function App() @{
  const fields = {value: draft$};
  <div>${spread ? '<input {...fields} />' : '<input value={draft$} />'}<p>{'Characters: ' + count$.get()}</p></div>
}`;
			const options = {
				id: `/src/adoption-race-${spread}.tsrx`,
				compileOptions: { dev: false },
				runtimeModules: { 'octane/signals': Signals },
			};
			const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
			const container = document.createElement('div');
			container.innerHTML = renderToString(server.App, {}).html;
			document.body.appendChild(container);
			const input = container.querySelector('input')!;
			const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const owner = Object.freeze({ scopeKey: options.id });
			initializeHydrationEventCapture(document);
			input.value = 'early';
			input.dispatchEvent(new InputEvent('input', { bubbles: true }));
			let raced = false;
			const unsubscribe = runWithSignalOwner(owner, () =>
				client.draft$.subscribe(() => {
					if (raced || client.draft$.get() !== 'early') return;
					raced = true;
					input.value = 'newer edit';
					input.dispatchEvent(new InputEvent('input', { bubbles: true }));
				}),
			);
			try {
				root = hydrateRoot(container, client.App, {}, { signalOwner: owner });
				await expect.poll(() => container.querySelector('p')?.textContent).toBe('Characters: 10');
				expect(raced).toBe(true);
				expect(container.querySelector('input')).toBe(input);
				expect(input.value).toBe('newer edit');
				expect(runWithSignalOwner(owner, () => client.draft$.get())).toBe('newer edit');
				expect(snapshotHydrationControl(input)?.editRevision).toBe(0);
			} finally {
				unsubscribe();
			}
		},
	);

	it.each([false, true])(
		'does not publish an edit from an abandoned compiled render (spread=%s)',
		(spread) => {
			const source = `import { signal$ } from 'octane/signals';
export const draft$ = signal$('server');
export function App(props) @{
  const fields = {value: draft$};
  <div>${spread ? '<input {...fields} />' : '<input value={draft$} />'}<p>{props.finish() as string}</p></div>
}`;
			const options = {
				id: `/src/adoption-rollback-${spread}.tsrx`,
				compileOptions: { dev: false },
				runtimeModules: { 'octane/signals': Signals },
			};
			const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
			const container = document.createElement('div');
			container.innerHTML = renderToString(server.App, { finish: () => 'ready' }).html;
			document.body.appendChild(container);
			const input = container.querySelector('input')!;
			const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
			const owner = Object.freeze({ scopeKey: options.id });
			expect(runWithSignalOwner(owner, () => client.draft$.get())).toBe('server');
			initializeHydrationEventCapture(document);
			input.value = 'not committed';
			input.dispatchEvent(new InputEvent('input', { bubbles: true }));
			expect(() =>
				hydrateRoot(
					container,
					client.App,
					{
						finish() {
							throw new Error('abandoned');
						},
					},
					{ signalOwner: owner },
				),
			).toThrow('abandoned');
			expect(runWithSignalOwner(owner, () => client.draft$.get())).toBe('server');
			expect(snapshotHydrationControl(input)?.editRevision).toBeGreaterThan(0);
		},
	);
});
