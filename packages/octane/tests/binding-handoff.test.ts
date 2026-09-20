import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import * as DomBindings from '../src/dom-bindings.js';
import * as DomBindingSignals from '../src/dom-binding-signals.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';

function fixture(dev: boolean, text = false, handlers = false) {
	const id = '/src/binding-handoff.tsrx';
	const source = `import { unbound } from 'octane/behavior';
  export function Status(props) @{
    'use dom bindings';
    <button type={props.type} disabled={props.disabled} aria-label={props.label} tabIndex={props.tabIndex}
      class={props.classes} style={{ opacity: props.opacity }} ${handlers ? 'onClick={unbound(props.onClick)}' : ''}>
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

describe.each([false, true])('compiled early binding handoff (dev=%s)', (dev) => {
	let binding: DomBindings.BindingHandle | undefined;
	let root: ReturnType<typeof hydrateRoot> | undefined;
	afterEach(() => {
		binding?.dispose();
		root?.unmount();
		document.body.replaceChildren();
		vi.restoreAllMocks();
	});

	it('leaves explicitly unbound handlers to normal application rendering', () => {
		const view = fixture(dev, true, true);
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
		const view = fixture(dev);
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
		expect(button.style.opacity).toBe('0.5');
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
		expect(button.style.opacity).toBe('1');
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
		expect(button.style.opacity).toBe('0.75');
		expect(button.type).toBe('submit');
		expect(button.disabled).toBe(false);
		expect(view.cleanup).toHaveBeenCalledOnce();
	});

	it('renders scalar status text before hydration, retains its identity and releases on abort', () => {
		const view = fixture(dev, true);
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
		const view = fixture(dev);
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
		const view = fixture(dev, true);
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
		const view = fixture(dev, true);
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
