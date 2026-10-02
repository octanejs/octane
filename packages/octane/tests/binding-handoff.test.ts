import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import * as DomBindings from '../src/dom-bindings.js';
import * as DomBindingSignals from '../src/dom-binding-signals.js';
import * as Signals from '../src/signals/index.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

// A style channel needs the general fixed-layout adopter. Without it, every
// channel is a fixed scalar and the compiler selects the scalar adopter
// (guarded by benchmarks/scoped-signals/bundle-boundaries.test.mjs).
function fixture(dev: boolean, style: boolean, text = false, handlers = false) {
	const id = '/src/binding-handoff.tsrx';
	const source = `import { unbound } from 'octane/behavior';
  export function Status(props) @{
    'use dom bindings';
    <button type={props.type} disabled={props.disabled} aria-label={props.label} tabIndex={props.tabIndex}
      class={props.classes} ${style ? 'style={{ opacity: props.opacity }}' : ''} ${handlers ? 'onClick={unbound(props.onClick)}' : ''}>
      <span hidden={props.hidden}>${text ? '{props.message as string}' : ''}</span>
    </button>
  }`;
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
		id: id + '?octane-bindings=Status',
		mode: 'client',
	});
	const activation = loadCompiledFixtureSource(
		`
    import { adoptBindings } from 'octane/behavior';
    import { Status } from './binding-handoff.tsrx';
    export function attach(root, source, options) { return adoptBindings(root, Status, source, options); }
  `,
		{
			...options,
			id: '/src/binding-handoff-activate.tsrx',
			mode: 'client',
			runtimeModules: {
				'octane/behavior': DomBindings,
				'octane/dom-bindings': DomBindings,
				'./binding-handoff.tsrx?octane-bindings=Status': descriptor,
			},
		},
	);
	const initial = {
		type: 'submit',
		disabled: false,
		label: 'Send',
		classes: 'ready',
		opacity: 1,
		hidden: true,
		tabIndex: 0,
		message: '',
		onClick: vi.fn(),
	};
	let snapshot = initial;
	const subscribers = new Set<() => void>();
	const cleanup = vi.fn();
	const state = {
		getSnapshot: () => snapshot,
		subscribe(notify: () => void) {
			subscribers.add(notify);
			return () => {
				subscribers.delete(notify);
				cleanup();
			};
		},
	};
	return {
		initial,
		client,
		cleanup,
		state,
		html: renderToString(server.Status, initial).html,
		attach: activation.attach as (
			node: Element,
			source: typeof state,
			options?: DomBindings.BindingOptions,
		) => DomBindings.BindingHandle,
		publish(next: Partial<typeof initial>) {
			snapshot = { ...snapshot, ...next };
			for (const notify of subscribers) notify();
		},
	};
}

describe.each([
	{ dev: false, style: true },
	{ dev: false, style: false },
	{ dev: true, style: true },
	{ dev: true, style: false },
])('compiled early binding handoff (dev=$dev, style=$style)', ({ dev, style }) => {
	let binding: DomBindings.BindingHandle | undefined;
	let root: ReturnType<typeof hydrateRoot> | undefined;
	afterEach(() => {
		binding?.dispose();
		root?.unmount();
		document.body.replaceChildren();
		vi.restoreAllMocks();
	});

	it('leaves explicitly unbound handlers to normal application rendering', () => {
		const view = fixture(dev, style, true, true);
		document.body.innerHTML = view.html;
		const button = document.body.querySelector('button')!;
		binding = view.attach(button, view.state);
		button.click();
		expect(view.initial.onClick).not.toHaveBeenCalled();
		flushSync(() => {
			root = hydrateRoot(document.body, view.client.Status, view.initial);
		});
		binding.dispose();
		button.click();
		expect(view.initial.onClick).toHaveBeenCalledOnce();
		root!.unmount();
		button.click();
		expect(view.initial.onClick).toHaveBeenCalledOnce();
	});

	it('adopts active attribute, class and style values through historical hydration and then updates normally', () => {
		const view = fixture(dev, style);
		document.body.innerHTML = view.html;
		const button = document.body.querySelector('button')!;
		const span = button.firstElementChild!;
		binding = view.attach(button, view.state);
		view.publish({
			type: 'button',
			disabled: true,
			label: 'Stop',
			classes: 'busy',
			opacity: 0.5,
			hidden: false,
			tabIndex: -1,
		});
		const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
		flushSync(() => {
			root = hydrateRoot(document.body, view.client.Status, view.initial);
		});
		expect(document.body.querySelector('button')).toBe(button);
		expect(button.firstElementChild).toBe(span);
		expect(button.type).toBe('button');
		expect(button.disabled).toBe(true);
		expect(button.getAttribute('aria-label')).toBe('Stop');
		expect(button.className).toBe('busy');
		expect(button.style.opacity).toBe(style ? '0.5' : '');
		expect(span.hasAttribute('hidden')).toBe(false);
		expect(button.tabIndex).toBe(-1);
		expect(warn).not.toHaveBeenCalled();
		binding.dispose();
		// Returning directly to the historical props must publish them even though
		// hydration already evaluated those same values while retaining the adapter.
		flushSync(() => root!.render(view.client.Status, view.initial));
		expect(button.type).toBe('submit');
		expect(button.disabled).toBe(false);
		expect(button.getAttribute('aria-label')).toBe('Send');
		expect(button.className).toBe('ready');
		expect(button.style.opacity).toBe(style ? '1' : '');
		expect(span.hasAttribute('hidden')).toBe(true);
		expect(button.tabIndex).toBe(0);
		const unchanged = new MutationObserver(() => {});
		unchanged.observe(button, {
			attributes: true,
			childList: true,
			characterData: true,
			subtree: true,
		});
		flushSync(() => root!.render(view.client.Status, view.initial));
		expect(unchanged.takeRecords()).toHaveLength(0);
		unchanged.disconnect();
		flushSync(() =>
			root!.render(view.client.Status, {
				...view.initial,
				label: 'Retry',
				classes: 'retry',
				opacity: 0.75,
			}),
		);
		expect(button.getAttribute('aria-label')).toBe('Retry');
		expect(button.className).toBe('retry');
		expect(button.style.opacity).toBe(style ? '0.75' : '');
		expect(button.type).toBe('submit');
		expect(button.disabled).toBe(false);
		expect(view.cleanup).toHaveBeenCalledOnce();
	});

	it('renders scalar status text before hydration, retains its identity and releases on abort', () => {
		const view = fixture(dev, style, true);
		document.body.innerHTML = view.html;
		const button = document.body.querySelector('button')!;
		const span = button.firstElementChild!;
		const controller = new AbortController();
		binding = view.attach(button, view.state, { signal: controller.signal });
		view.publish({ message: 'Try <again> & keep your draft', hidden: false });
		expect(span.textContent).toBe('Try <again> & keep your draft');
		expect(span.children).toHaveLength(0);
		const text = span.firstChild;
		const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
		flushSync(() => {
			root = hydrateRoot(document.body, view.client.Status, view.initial);
		});
		expect(span.textContent).toBe('Try <again> & keep your draft');
		expect(span.firstChild).toBe(text);
		expect(warn).not.toHaveBeenCalled();
		view.publish({ message: '' });
		expect(span.textContent).toBe('');
		expect(span.firstChild).toBe(text);
		view.publish({ message: 'Newer edit' });
		expect(span.firstChild).toBe(text);
		controller.abort();
		view.publish({ message: 'Late result' });
		expect(span.textContent).toBe('Newer edit');
		expect(view.cleanup).toHaveBeenCalledOnce();
		flushSync(() => root!.render(view.client.Status, view.initial));
		expect(span.textContent).toBe('');
		expect(span.firstChild).toBe(text);
		flushSync(() =>
			root!.render(view.client.Status, { ...view.initial, message: 'Application status' }),
		);
		expect(span.textContent).toBe('Application status');
		expect(span.firstChild).toBe(text);
	});

	it('keeps ordinary hydration diagnostics when DOM no longer matches the binding publication', () => {
		const view = fixture(dev, style);
		document.body.innerHTML = view.html;
		const button = document.body.querySelector('button')!;
		binding = view.attach(button, view.state);
		view.publish({ label: 'Stop' });
		button.setAttribute('aria-label', 'Unrelated mutation');
		const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
		flushSync(() => {
			root = hydrateRoot(document.body, view.client.Status, view.initial);
		});
		expect(button.getAttribute('aria-label')).toBe('Send');
		if (dev) expect(warn).toHaveBeenCalled();
		else expect(warn).not.toHaveBeenCalled();
	});

	it('rejects non-scalar text before any publication and releases every binding claim', () => {
		const view = fixture(dev, style, true);
		document.body.innerHTML = view.html;
		const button = document.body.querySelector('button')!;
		const span = button.firstElementChild!;
		binding = view.attach(button, view.state);
		const text = span.firstChild;
		expect(() =>
			view.publish({
				label: 'Partial update',
				message: Promise.resolve('not synchronous') as unknown as string,
			}),
		).toThrow(/synchronous scalar/);
		expect(button.getAttribute('aria-label')).toBe('Send');
		expect(span.firstChild).toBe(text);
		expect(span.textContent).toBe('');
		expect(view.cleanup).toHaveBeenCalledOnce();
		view.publish({ label: 'Retry', message: 'Available' });
		binding = view.attach(button, view.state);
		expect(button.getAttribute('aria-label')).toBe('Retry');
		expect(span.textContent).toBe('Available');
	});

	it('preserves text-hole scalar semantics, including true, zero and empty values', () => {
		const view = fixture(dev, style, true);
		document.body.innerHTML = view.html;
		const button = document.body.querySelector('button')!;
		const span = button.firstElementChild!;
		binding = view.attach(button, view.state);
		const text = span.firstChild;
		for (const [value, expected] of [
			[true, 'true'],
			[0, '0'],
			[42n, '42'],
			[false, ''],
			[null, ''],
			[undefined, ''],
			['<script>', '<script>'],
		] as const) {
			view.publish({ message: value as unknown as string });
			expect(span.textContent).toBe(expected);
			expect(span.firstChild).toBe(text);
			expect(span.children).toHaveLength(0);
		}
	});
});

// A fixed view binds `{value as number}` as one text leaf that reads a signal
// handle's value. Its server output must be that text, which both the early
// binding and the ordinary renderer then adopt in place. Without bindings the
// same hole stays a renderable child, which hydration adopts as before.
describe.each([false, true])('signal handles cast to number in text leaves (dev=%s)', (dev) => {
	const views = {
		// A module signal and a module derived value as the root's only child.
		Count: '<p title={props.title}>{count$ as number}</p>',
		Label: '<p title={props.title}>{label$ as number}</p>',
		// Nested leaves: a module signal and a derived handle passed through props.
		Nested: '<p title={props.title}><b>{count$ as number}</b><i>{props.label as number}</i></p>',
	};
	const expected = {
		Count: [['1'], ['2']],
		Label: [['n=1'], ['n=2']],
		Nested: [
			['1', 'n=1'],
			['2', 'n=2'],
		],
	};
	type View = keyof typeof views;
	let cases = 0;

	function render(name: View, bindings: boolean) {
		// Module signal identity is keyed by file, so every case owns fresh state.
		const stateId = `/src/number-cast-state-${dev}-${cases++}.tsrx`;
		const state = (mode: 'client' | 'server') =>
			loadCompiledFixtureSource(
				`import { derived$, signal$ } from 'octane/signals';
  export const count$ = signal$(1);
  export const label$ = derived$(() => 'n=' + count$.get());`,
				{
					id: stateId,
					mode,
					compileOptions: { dev, hmr: false },
					runtimeModules: { 'octane/signals': Signals },
				},
			);
		const serverState = state('server');
		const clientState = state('client');
		const id = `/src/number-cast-${name}-${bindings}.tsrx`;
		const source = `import { count$, label$ } from './number-cast-state';
  export function View(props) @{
    ${bindings ? "'use dom bindings';" : ''}
    ${views[name]}
  }`;
		const options = (module: Record<string, unknown>) => ({
			compileOptions: { dev, hmr: false },
			runtimeModules: {
				'octane/behavior': DomBindings,
				'octane/dom-bindings': DomBindings,
				'octane/dom-binding-signals': DomBindingSignals,
				'./number-cast-state': module,
			},
		});
		const server = loadCompiledFixtureSource(source, {
			...options(serverState),
			id,
			mode: 'server',
		});
		document.body.innerHTML = renderToString(server.View, {
			title: 'Count',
			label: serverState.label$,
		}).html;
		const paragraph = document.querySelector('p')!;
		const leaves = name === 'Nested' ? [...paragraph.children] : [paragraph];
		const text = () => leaves.map((leaf) => leaf.textContent);
		const textNodes = () =>
			leaves.map((leaf) => [...leaf.childNodes].find((node) => node.nodeType === Node.TEXT_NODE));
		return {
			count$: clientState.count$ as Signals.WritableSignal<number>,
			props: { title: 'Count', label: clientState.label$ },
			paragraph,
			text,
			textNodes,
			client: () =>
				loadCompiledFixtureSource(source, { ...options(clientState), id, mode: 'client' }),
			view: () =>
				loadCompiledFixtureSource(source, {
					...options(clientState),
					id: `${id}?octane-bindings=View`,
					mode: 'client',
				}).default as DomBindings.CompiledBindings<Record<string, unknown>> & {
					adopt: typeof DomBindings.__adoptBindings;
				},
		};
	}

	function hydrate(name: View, bindings: boolean) {
		const { count$, props, paragraph, text, textNodes, client } = render(name, bindings);
		const servedText = textNodes();
		expect(servedText).not.toContain(undefined);
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const recoverable = vi.fn();
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			flushSync(() => {
				root = hydrateRoot(document.body, client().View, props, {
					onRecoverableError: recoverable,
				});
			});
			expect(document.querySelector('p')).toBe(paragraph);
			textNodes().forEach((node, index) => expect(node).toBe(servedText[index]));
			expect(text()).toEqual(expected[name][0]);
			flushSync(() => count$.set(2));
			expect(text()).toEqual(expected[name][1]);
			expect(recoverable).not.toHaveBeenCalled();
			expect(error).not.toHaveBeenCalled();
		} finally {
			root?.unmount();
		}
	}

	afterEach(() => {
		document.body.replaceChildren();
		vi.restoreAllMocks();
	});

	it.each(Object.keys(views) as View[])(
		'adopts the server text in place and updates it from the handles (%s)',
		(name) => {
			const { count$, props, paragraph, text, textNodes, view } = render(name, true);
			const servedText = textNodes();
			expect(servedText).not.toContain(undefined);
			expect(text()).toEqual(expected[name][0]);
			const artifact = view();
			const handle = artifact.adopt(paragraph, artifact, {
				getSnapshot: () => props,
				subscribe: () => () => {},
			});
			try {
				count$.set(2);
				expect(text()).toEqual(expected[name][1]);
				textNodes().forEach((node, index) => expect(node).toBe(servedText[index]));
			} finally {
				handle.dispose();
			}
		},
	);

	it.each(Object.keys(views) as View[])(
		'hydrates the same server text with the ordinary renderer (%s)',
		(name) => hydrate(name, true),
	);

	it.each(Object.keys(views) as View[])(
		'hydrates the hole in place in a view without bindings (%s)',
		(name) => hydrate(name, false),
	);
});
