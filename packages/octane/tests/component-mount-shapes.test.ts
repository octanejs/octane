import { describe, expect, it } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { mount } from './_helpers';
import { loadServerFixture } from './_server-fixture';
import { KeyedPair } from './_fixtures/component-children-host.tsrx';
import { NestedRefs } from './_fixtures/scope-lazy-collections.tsrx';

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
