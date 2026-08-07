import { describe, expect, it, vi } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { flushSync, hydrateRoot, isValidElement } from '../src/index.js';
import { act, mount } from './_helpers';
import { loadServerFixture } from './_server-fixture';
import {
	DefaultPropsNestedApp,
	DescriptorEscapedApp,
	DirectNestedApp,
	EscapedNestedApp,
	MixedNestedApp,
	NestedErrorApp,
	NestedFallbackApp,
	NestedSuspenseApp,
	ProviderApp,
	ReconcileApp,
	InputApp,
	InputListApp,
	PrivateNestedApp,
	StaticNestedApp,
	bumpCount,
	directNestedMiddleReturnValue,
	directNestedReturnValue,
	escapedNestedDescriptor,
	readNestedDefaultEvents,
	reRenderParent,
	reRenderField,
	reRenderList,
	resetNestedDefaultEvents,
} from './_fixtures/jsx-context-children.tsx';

// JSX backwards-compat: a React-style `.tsx` `<Ctx.Provider value>` with element
// children, and host elements with component children produced via `createElement`
// from control-flow returns (the de-opt path), must render and reconcile.

it('.tsx <Context.Provider> renders element-descriptor children and provides context', () => {
	const r = mount(ProviderApp as any);
	// The host <div class="wrap"> with component children renders (de-opt host path).
	expect(r.findAll('.wrap').length).toBe(1);
	// The Provider's JSX children render — both leaves.
	expect(r.findAll('.leaf').length).toBe(2);
	// Context flows to the leaves through the createElement path.
	for (const el of r.findAll('.leaf')) expect(el.textContent).toBe('provided');
	r.unmount();
});

it('.tsx host element with component children reconciles (child state survives parent re-render)', () => {
	const r = mount(ReconcileApp as any);
	expect(r.find('.count').textContent).toBe('0');
	flushSync(() => bumpCount());
	expect(r.find('.count').textContent).toBe('1');
	// Re-render the PARENT: the de-opt host (<div class="host">) and its <Counter>
	// child must RECONCILE (preserve state), not rebuild back to 0.
	flushSync(() => reRenderParent());
	expect(r.find('.count').textContent).toBe('1');
	r.unmount();
});

it('.tsx pure-host de-opt node is REUSED across a re-render (DOM state survives)', () => {
	const r = mount(InputApp as any);
	const input = r.find('.field') as HTMLInputElement;
	// Simulate DOM-resident state a rebuild would destroy: a typed value + a class.
	input.value = 'typed';
	input.classList.add('marked');
	// Re-render the parent. The de-opt path must REUSE the <input> node, not rebuild.
	flushSync(() => reRenderField());
	const input2 = r.find('.field') as HTMLInputElement;
	expect(input2).toBe(input); // same node — not recreated
	expect(input2.value).toBe('typed'); // DOM-resident state survived
	expect(input2.classList.contains('marked')).toBe(true);
	r.unmount();
});

it('.tsx pure-host de-opt LIST items are reused across a re-render (per-item DOM state survives)', () => {
	const r = mount(InputListApp as any);
	const inputs = r.findAll('.li') as HTMLInputElement[];
	expect(inputs.length).toBe(3);
	inputs.forEach((el, i) => (el.value = 'v' + i));
	flushSync(() => reRenderList());
	const inputs2 = r.findAll('.li') as HTMLInputElement[];
	expect(inputs2.length).toBe(3);
	inputs2.forEach((el, i) => {
		expect(el).toBe(inputs[i]); // same node per item (deoptItemBody reuse)
		expect(el.value).toBe('v' + i); // typed value survived
	});
	r.unmount();
});

it('positional component children do NOT emit the de-opt "missing key" warning', () => {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		const r = mount(ProviderApp as any); // renders <div><CtxLeaf/><CtxLeaf/></div>
		const keyWarnings = warn.mock.calls.filter((c) => String(c[0]).includes('unique "key"'));
		expect(keyWarnings.length).toBe(0);
		r.unmount();
	} finally {
		warn.mockRestore();
	}
});

describe('same-module JSX component children', () => {
	it('renders nested components in their authored order without replacing their DOM', () => {
		const r = mount(StaticNestedApp);
		const root = r.find('.static-nested-root');
		const middle = r.find('.static-nested-middle');
		const leaf = r.find('.static-nested-leaf');

		expect(leaf.textContent).toBe('static');
		expect(root.textContent).toBe('beforestaticafter');
		r.update(StaticNestedApp);
		expect(r.find('.static-nested-root')).toBe(root);
		expect(r.find('.static-nested-middle')).toBe(middle);
		expect(r.find('.static-nested-leaf')).toBe(leaf);
		r.unmount();
	});

	it('preserves nested hook state while parent props and context change', () => {
		const r = mount(DirectNestedApp, { label: 'first', theme: 'light' });
		const child = r.find('.direct-nested-leaf');

		expect(child.textContent).toBe('light:0');
		r.click('.direct-nested-leaf');
		expect(child.textContent).toBe('light:1');

		r.update(DirectNestedApp, { label: 'second', theme: 'light' });
		expect(r.find('.direct-nested-host').getAttribute('data-label')).toBe('second');
		expect(r.find('.direct-nested-leaf')).toBe(child);
		expect(child.textContent).toBe('light:1');

		r.update(DirectNestedApp, { label: 'second', theme: 'dark' });
		expect(r.find('.direct-nested-leaf')).toBe(child);
		expect(child.textContent).toBe('dark:1');
		r.click('.direct-nested-leaf');
		expect(child.textContent).toBe('dark:2');
		r.unmount();
	});

	it('preserves live default-props getters, their context, and their authored evaluation order', () => {
		resetNestedDefaultEvents();
		const r = mount(DefaultPropsNestedApp, { theme: 'light', version: 'first' });
		const child = r.find('.default-props-stateful');

		expect(r.find('.default-props-pure').textContent).toBe('pure');
		expect(child.textContent).toBe('light:first:0');
		expect(readNestedDefaultEvents()).toEqual(['pure:light:first', 'stateful:light:first']);

		r.click('.default-props-stateful');
		expect(child.textContent).toBe('light:first:1');
		expect(readNestedDefaultEvents()).toEqual(['pure:light:first', 'stateful:light:first']);

		r.update(DefaultPropsNestedApp, { theme: 'dark', version: 'second' });
		expect(r.find('.default-props-stateful')).toBe(child);
		expect(child.textContent).toBe('dark:second:1');
		expect(readNestedDefaultEvents()).toEqual([
			'pure:light:first',
			'stateful:light:first',
			'pure:dark:second',
			'stateful:dark:second',
		]);
		r.unmount();
	});

	it('preserves dynamic props, spreads, refs, keys, and inspectable children', () => {
		const refs: Array<HTMLButtonElement | null> = [];
		const onRef = (node: HTMLButtonElement | null) => refs.push(node);
		const r = mount(NestedFallbackApp, { label: 'first', identity: 'a', onRef });
		const refNode = r.find('.fallback-ref');
		const firstKeyed = r.find('.fallback-keyed');

		expect(r.find('[data-fallback-kind="attribute"]').textContent).toBe('first');
		expect(r.find('[data-fallback-kind="spread"]').textContent).toBe('first');
		expect(refs).toContain(refNode);
		expect(r.find('.fallback-children').getAttribute('data-valid')).toBe('true');
		expect(r.find('.fallback-children .static-nested-leaf').textContent).toBe('static');

		r.click('.fallback-keyed');
		expect(firstKeyed.textContent).toBe('1');
		r.update(NestedFallbackApp, { label: 'second', identity: 'a', onRef });
		expect(r.find('[data-fallback-kind="attribute"]').textContent).toBe('second');
		expect(r.find('[data-fallback-kind="spread"]').textContent).toBe('second');
		expect(r.find('.fallback-ref')).toBe(refNode);
		expect(r.find('.fallback-keyed')).toBe(firstKeyed);
		expect(firstKeyed.textContent).toBe('1');

		r.update(NestedFallbackApp, { label: 'second', identity: 'b', onRef });
		expect(r.find('.fallback-keyed')).not.toBe(firstKeyed);
		expect(r.find('.fallback-keyed').textContent).toBe('0');
		r.unmount();
		expect(refs.at(-1)).toBeNull();
	});

	it('keeps escaped JSX and directly called component results as inspectable elements', () => {
		expect(isValidElement(directNestedReturnValue())).toBe(true);
		expect(isValidElement(directNestedMiddleReturnValue())).toBe(true);

		const r = mount(EscapedNestedApp);
		expect(r.find('.escaped-nested-root').getAttribute('data-valid')).toBe('true');
		expect(r.find('.static-nested-leaf').textContent).toBe('static');
		r.unmount();
	});

	it('observes default props installed through an escaped JSX element type', () => {
		const descriptor = escapedNestedDescriptor();
		expect(isValidElement(descriptor)).toBe(true);
		const component = descriptor.type as object;
		const reads: string[] = [];
		Object.defineProperty(component, 'defaultProps', {
			configurable: true,
			get() {
				reads.push('default props read');
				return {};
			},
		});

		try {
			const r = mount(DescriptorEscapedApp);
			expect(r.find('.descriptor-escaped-leaf').textContent).toBe('descriptor');
			expect(reads).toEqual(['default props read']);
			r.unmount();
		} finally {
			Reflect.deleteProperty(component, 'defaultProps');
		}
	});

	it('hydrates static nested components and preserves their original sibling and element nodes', () => {
		const server = loadServerFixture('packages/octane/tests/_fixtures/jsx-context-children.tsx');
		const { html } = ServerRuntime.renderToString(server.StaticNestedApp);
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);
		const original = {
			root: container.querySelector('.static-nested-root'),
			before: container.querySelector('.static-nested-before'),
			middle: container.querySelector('.static-nested-middle'),
			leaf: container.querySelector('.static-nested-leaf'),
			after: container.querySelector('.static-nested-after'),
		};

		const root = hydrateRoot(container, StaticNestedApp);
		flushSync(() => {});
		expect(container.querySelector('.static-nested-root')).toBe(original.root);
		expect(container.querySelector('.static-nested-before')).toBe(original.before);
		expect(container.querySelector('.static-nested-middle')).toBe(original.middle);
		expect(container.querySelector('.static-nested-leaf')).toBe(original.leaf);
		expect(container.querySelector('.static-nested-after')).toBe(original.after);
		expect(original.root?.textContent).toBe('beforestaticafter');

		flushSync(() => root.render(StaticNestedApp));
		expect(container.querySelector('.static-nested-middle')).toBe(original.middle);
		expect(container.querySelector('.static-nested-leaf')).toBe(original.leaf);
		expect(original.root?.textContent).toBe('beforestaticafter');
		root.unmount();
		container.remove();
	});

	it('hydrates wholly private nested components without replacing their siblings or elements', () => {
		const server = loadServerFixture('packages/octane/tests/_fixtures/jsx-context-children.tsx');
		const { html } = ServerRuntime.renderToString(server.PrivateNestedApp);
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);
		const original = {
			root: container.querySelector('.private-nested-root'),
			before: container.querySelector('.private-nested-before'),
			middle: container.querySelector('.private-nested-middle'),
			leaf: container.querySelector('.private-nested-leaf'),
			after: container.querySelector('.private-nested-after'),
		};

		const root = hydrateRoot(container, PrivateNestedApp);
		flushSync(() => {});
		expect(container.querySelector('.private-nested-root')).toBe(original.root);
		expect(container.querySelector('.private-nested-before')).toBe(original.before);
		expect(container.querySelector('.private-nested-middle')).toBe(original.middle);
		expect(container.querySelector('.private-nested-leaf')).toBe(original.leaf);
		expect(container.querySelector('.private-nested-after')).toBe(original.after);
		expect(original.root?.textContent).toBe('beforeprivateafter');

		flushSync(() => root.render(PrivateNestedApp));
		expect(container.querySelector('.private-nested-middle')).toBe(original.middle);
		expect(container.querySelector('.private-nested-leaf')).toBe(original.leaf);
		expect(original.root?.textContent).toBe('beforeprivateafter');
		root.unmount();
		container.remove();
	});

	it('hydrates a hook-owning child through nested static component boundaries', () => {
		const server = loadServerFixture('packages/octane/tests/_fixtures/jsx-context-children.tsx');
		const { html } = ServerRuntime.renderToString(server.MixedNestedApp, { theme: 'light' });
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);
		const host = container.querySelector('.mixed-nested-host');
		const middle = container.querySelector('.static-nested-middle');
		const shell = container.querySelector('.mixed-nested-shell');
		const child = container.querySelector('.direct-nested-leaf');

		const root = hydrateRoot(container, MixedNestedApp, { theme: 'light' });
		flushSync(() => {});
		expect(container.querySelector('.mixed-nested-host')).toBe(host);
		expect(container.querySelector('.static-nested-middle')).toBe(middle);
		expect(container.querySelector('.mixed-nested-shell')).toBe(shell);
		expect(container.querySelector('.direct-nested-leaf')).toBe(child);
		expect(child?.textContent).toBe('light:0');

		flushSync(() => (child as HTMLButtonElement).click());
		flushSync(() => root.render(MixedNestedApp, { theme: 'dark' }));
		expect(container.querySelector('.mixed-nested-host')).toBe(host);
		expect(container.querySelector('.mixed-nested-shell')).toBe(shell);
		expect(container.querySelector('.direct-nested-leaf')).toBe(child);
		expect(child?.textContent).toBe('dark:1');
		root.unmount();
		container.remove();
	});

	it('hydrates nested component DOM in place and preserves later state and context updates', () => {
		const server = loadServerFixture('packages/octane/tests/_fixtures/jsx-context-children.tsx');
		const props = { label: 'server', theme: 'light' };
		const { html } = ServerRuntime.renderToString(server.DirectNestedApp, props);
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);
		const host = container.querySelector('.direct-nested-host');
		const child = container.querySelector('.direct-nested-leaf');

		const root = hydrateRoot(container, DirectNestedApp, props);
		flushSync(() => {});
		expect(container.querySelector('.direct-nested-host')).toBe(host);
		expect(container.querySelector('.direct-nested-leaf')).toBe(child);
		expect(child?.textContent).toBe('light:0');

		flushSync(() => (child as HTMLButtonElement).click());
		expect(child?.textContent).toBe('light:1');
		flushSync(() => root.render(DirectNestedApp, { label: 'client', theme: 'dark' }));
		expect(container.querySelector('.direct-nested-host')).toBe(host);
		expect(container.querySelector('.direct-nested-leaf')).toBe(child);
		expect(host?.getAttribute('data-label')).toBe('client');
		expect(child?.textContent).toBe('dark:1');
		root.unmount();
		container.remove();
	});

	it('routes errors from a nested child to its nearest error boundary', () => {
		const r = mount(NestedErrorApp);
		expect(r.find('.nested-error-fallback').textContent).toBe('caught');
		expect(r.findAll('.nested-unreachable')).toHaveLength(0);
		r.unmount();
	});

	it('suspends a nested child inside its boundary and retries when its promise resolves', async () => {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((complete) => {
			resolve = complete;
		});
		const r = mount(NestedSuspenseApp, { promise });
		expect(r.find('.nested-pending').textContent).toBe('pending');

		await act(() => resolve('ready'));
		expect(r.find('.nested-resolved').textContent).toBe('ready');
		expect(r.findAll('.nested-pending')).toHaveLength(0);
		r.unmount();
	});
});
