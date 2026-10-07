import { describe, expect, it } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { mount } from './_helpers';
import { loadServerFixture } from './_server-fixture';
import AnonymousDefaultArrow from './_fixtures/anonymous-default-arrow-component.tsrx';
import AnonymousDefault from './_fixtures/anonymous-default-component.tsrx';
import { KeyedPair } from './_fixtures/component-children-host.tsrx';
import NamedDefaultExpression, {
	moduleCounter,
} from './_fixtures/named-default-expression-component.tsrx';
import { NestedRefs } from './_fixtures/scope-lazy-collections.tsrx';

const ANONYMOUS_DEFAULT_FIXTURE =
	'packages/octane/tests/_fixtures/anonymous-default-component.tsrx';
const ANONYMOUS_DEFAULT_ARROW_FIXTURE =
	'packages/octane/tests/_fixtures/anonymous-default-arrow-component.tsrx';
const NAMED_DEFAULT_EXPRESSION_FIXTURE =
	'packages/octane/tests/_fixtures/named-default-expression-component.tsrx';
const NESTED_REFS_FIXTURE = 'packages/octane/tests/_fixtures/scope-lazy-collections.tsrx';

describe('component placement and identity', () => {
	it('keeps nested hookless children attached through a parent update and detaches their refs', () => {
		const attached: Element[] = [];
		const detached: Array<Element | null> = [];
		const collect = (node: Element | null) => {
			if (node === null) detached.push(node);
			else attached.push(node);
		};
		const r = mount(NestedRefs, { collect });
		try {
			const leaves = r.findAll('.leaf');
			expect(leaves).toHaveLength(2);
			expect(attached).toHaveLength(2);
			for (let index = 0; index < leaves.length; index++)
				expect(attached[index]).toBe(leaves[index]);

			r.update(NestedRefs, { collect });
			const updated = r.findAll('.leaf');
			for (let index = 0; index < leaves.length; index++)
				expect(updated[index]).toBe(leaves[index]);
			r.click('.toggle');
			expect(r.findAll('.leaf')).toHaveLength(0);
			expect(detached).toHaveLength(2);
		} finally {
			r.unmount();
		}
	});

	it('resets a keyed component while keeping its hookless sibling', () => {
		const r = mount(KeyedPair, { k: 1 });
		try {
			const counter = r.find('.c');
			const sibling = r.find('.leaf');
			r.click('.c');
			expect(counter.textContent).toBe('A:1');

			r.update(KeyedPair, { k: 1 });
			expect(r.find('.c')).toBe(counter);
			expect(r.find('.leaf')).toBe(sibling);
			expect(counter.textContent).toBe('A:1');

			r.update(KeyedPair, { k: 2 });
			expect(r.find('.c')).not.toBe(counter);
			expect(r.find('.c').textContent).toBe('A:0');
			expect(r.find('.leaf')).toBe(sibling);
		} finally {
			r.unmount();
		}
	});

	it('adopts nested hookless children without replacing their server nodes', () => {
		const server = loadServerFixture(NESTED_REFS_FIXTURE);
		const { html } = ServerRuntime.renderToString(server.NestedRefs, {
			collect: () => {},
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const leaves = Array.from(container.querySelectorAll('.leaf'));
		expect(leaves).toHaveLength(2);

		const attached: Element[] = [];
		const collect = (node: Element | null) => {
			if (node !== null) attached.push(node);
		};
		const root = hydrateRoot(container, NestedRefs, { collect });
		try {
			flushSync(() => {});
			const hydrated = Array.from(container.querySelectorAll('.leaf'));
			for (let index = 0; index < leaves.length; index++)
				expect(hydrated[index]).toBe(leaves[index]);
			expect(attached).toHaveLength(2);
			for (let index = 0; index < leaves.length; index++)
				expect(attached[index]).toBe(leaves[index]);

			root.render(NestedRefs, { collect });
			flushSync(() => {});
			const updated = Array.from(container.querySelectorAll('.leaf'));
			for (let index = 0; index < leaves.length; index++)
				expect(updated[index]).toBe(leaves[index]);
		} finally {
			root.unmount();
			container.remove();
		}
	});
});

// `export default function () @{…}` and `export default () => @{…}` declare no
// module binding of their own; each must still compile, render, and hydrate
// like a named default component.
describe.each([
	{ form: 'function', AnonymousDefault, fixture: ANONYMOUS_DEFAULT_FIXTURE },
	{
		form: 'arrow',
		AnonymousDefault: AnonymousDefaultArrow,
		fixture: ANONYMOUS_DEFAULT_ARROW_FIXTURE,
	},
])('anonymous default-exported $form component', ({ AnonymousDefault, fixture }) => {
	it('renders and keeps hook state across prop updates', () => {
		const r = mount(AnonymousDefault, { label: 'A' });
		try {
			const button = r.find('.counter');
			expect(button.textContent).toBe('A clicks 0');
			r.click('.counter');
			expect(button.textContent).toBe('A clicks 1');
			r.update(AnonymousDefault, { label: 'B' });
			expect(r.find('.counter')).toBe(button);
			expect(button.textContent).toBe('B clicks 1');
		} finally {
			r.unmount();
		}
	});

	it.each([false, true])('server-renders the default export (dev compile: %s)', (dev) => {
		const server = loadServerFixture(fixture, { compileOptions: { dev } });
		const { html } = ServerRuntime.renderToString(server.default, { label: 'A' });
		const container = document.createElement('div');
		container.innerHTML = html;
		expect(container.querySelector('.counter')?.textContent).toBe('A clicks 0');
	});

	it('hydrates the server markup in place and stays interactive', () => {
		const server = loadServerFixture(fixture);
		const { html } = ServerRuntime.renderToString(server.default, { label: 'A' });
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const button = container.querySelector<HTMLButtonElement>('.counter')!;

		const root = hydrateRoot(container, AnonymousDefault, { label: 'A' });
		try {
			flushSync(() => {});
			expect(container.querySelector('.counter')).toBe(button);
			expect(button.textContent).toBe('A clicks 0');
			flushSync(() => button.click());
			expect(button.textContent).toBe('A clicks 1');
		} finally {
			root.unmount();
			container.remove();
		}
	});
});

// `export default (function Counter() @{…})` binds `Counter` only inside the
// component, so a module binding may share the name. The component must still
// render itself by that name without redeclaring or shadowing the module's.
describe('parenthesized named default component whose name the module also binds', () => {
	const counters = (root: ParentNode) =>
		[...root.querySelectorAll('.counter')].map((button) => button.textContent);

	it('renders itself by name and leaves the module binding alone', () => {
		expect(moduleCounter).toBe('module binding');
		const r = mount(NamedDefaultExpression, { label: 'A' });
		try {
			expect(counters(r.container)).toEqual(['A 0', 'nested 0']);
			r.click('.counter');
			expect(counters(r.container)).toEqual(['A 1', 'nested 0']);
		} finally {
			r.unmount();
		}
	});

	it.each([false, true])('server-renders and hydrates it (dev compile: %s)', (dev) => {
		const server = loadServerFixture(NAMED_DEFAULT_EXPRESSION_FIXTURE, {
			compileOptions: { dev },
		});
		expect(server.moduleCounter).toBe('module binding');
		const { html } = ServerRuntime.renderToString(server.default, { label: 'A' });
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		expect(counters(container)).toEqual(['A 0', 'nested 0']);
		const button = container.querySelector<HTMLButtonElement>('.counter')!;

		const root = hydrateRoot(container, NamedDefaultExpression, { label: 'A' });
		try {
			flushSync(() => {});
			expect(container.querySelector('.counter')).toBe(button);
			flushSync(() => button.click());
			expect(counters(container)).toEqual(['A 1', 'nested 0']);
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
