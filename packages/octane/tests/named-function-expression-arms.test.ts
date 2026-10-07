import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { createRoot, flushSync, hydrateRoot } from '../src/index.js';
import { loadServerFixture } from './_server-fixture.js';
import {
	BlockDeclaration,
	NestedIf,
	RecursiveFor,
	RecursiveIf,
	RecursiveSwitch,
} from './_fixtures/named-function-expression-arms.tsrx';
import DefaultCounter from './_fixtures/named-function-expression-default.tsrx';

const armsFixture = 'packages/octane/tests/_fixtures/named-function-expression-arms.tsrx';
const defaultFixture = 'packages/octane/tests/_fixtures/named-function-expression-default.tsrx';

const modes = ['render', 'hydrate'] as const;

// toEqual compares DOM nodes structurally; identity needs a per-node toBe.
function expectSameNodes(actual: readonly Node[], expected: readonly Node[]): void {
	expect(actual).toHaveLength(expected.length);
	for (let index = 0; index < expected.length; index++) expect(actual[index]).toBe(expected[index]);
}

// Mounts on the client, or server-renders the same fixture export and hydrates
// it, then exposes the buttons each level renders.
function start(
	mode: (typeof modes)[number],
	fixture: string,
	exportName: string,
	Component: any,
	props: object,
) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	let adopted: Element[] = [];
	if (mode === 'hydrate') {
		const server = loadServerFixture(fixture, { compileOptions: { hmr: false } });
		container.innerHTML = renderToString(server[exportName], props).html;
		adopted = [...container.querySelectorAll('button')];
	}
	const errors: unknown[] = [];
	const root =
		mode === 'render'
			? createRoot(container)
			: hydrateRoot(container, Component, props, {
					onRecoverableError: (error) => errors.push(error),
				});
	flushSync(() => {
		if (mode === 'render') root.render(Component, props);
	});
	const buttons = () => [...container.querySelectorAll('button')];
	return {
		container,
		errors,
		adopted,
		buttons,
		texts: () => buttons().map((button) => button.textContent?.trim()),
		render: (next: object) => flushSync(() => root.render(Component, next)),
		click: (index: number) => flushSync(() => buttons()[index].click()),
		unmount() {
			root.unmount();
			container.remove();
		},
	};
}

describe('a component that renders itself by its function name', () => {
	it.each(modes)('%s: memo(function Name) renders itself from an @if arm', (mode) => {
		const props = { depth: 0, max: 2, label: 'a' };
		const view = start(mode, armsFixture, 'RecursiveIf', RecursiveIf, props);
		try {
			expect(view.texts()).toEqual(['a0:0', 'a1:0', 'a2:0']);
			if (mode === 'hydrate') expectSameNodes(view.buttons(), view.adopted);
			const buttons = view.buttons();
			view.click(2);
			view.click(1);
			expect(view.texts()).toEqual(['a0:0', 'a1:1', 'a2:1']);
			view.render({ ...props, label: 'b' });
			expectSameNodes(view.buttons(), buttons);
			expect(view.texts()).toEqual(['b0:0', 'b1:1', 'b2:1']);
			view.render({ ...props, label: 'b', max: 1 });
			expect(view.texts()).toEqual(['b0:0', 'b1:1']);
			expect(view.errors).toEqual([]);
		} finally {
			view.unmount();
		}
	});

	it.each(modes)('%s: memo(function Name) renders itself from keyed @for rows', (mode) => {
		const leaf = { id: 'c', children: [] };
		const a = { id: 'a', children: [] };
		const b = { id: 'b', children: [leaf] };
		const props = { node: { id: 'r', children: [a, b] }, suffix: '!' };
		const view = start(mode, armsFixture, 'RecursiveFor', RecursiveFor, props);
		try {
			expect(view.texts()).toEqual(['r!:0', 'a!:0', 'b!:0', 'c!:0']);
			if (mode === 'hydrate') expectSameNodes(view.buttons(), view.adopted);
			const row = view.container.querySelector('[data-id="c"] button');
			view.click(3);
			expect(view.texts()).toEqual(['r!:0', 'a!:0', 'b!:0', 'c!:1']);
			view.render({ node: { id: 'r', children: [b, a] }, suffix: '?' });
			expect(view.texts()).toEqual(['r?:0', 'b?:0', 'c?:1', 'a?:0']);
			expect(view.container.querySelector('[data-id="c"] button')).toBe(row);
			expect(view.errors).toEqual([]);
		} finally {
			view.unmount();
		}
	});

	it.each(modes)('%s: memo(function Name) renders itself from a @switch case', (mode) => {
		const props = { kind: 'group', suffix: '!' };
		const view = start(mode, armsFixture, 'RecursiveSwitch', RecursiveSwitch, props);
		try {
			expect(view.texts()).toEqual(['group!:0', 'item!:0']);
			expect(view.container.querySelector('span')?.textContent).toBe('leaf');
			if (mode === 'hydrate') expectSameNodes(view.buttons(), view.adopted);
			const buttons = view.buttons();
			view.click(1);
			view.render({ ...props, suffix: '?' });
			expectSameNodes(view.buttons(), buttons);
			expect(view.texts()).toEqual(['group?:0', 'item?:1']);
			view.render({ kind: 'item', suffix: '?' });
			expect(view.texts()).toEqual(['item?:0']);
			expect(view.errors).toEqual([]);
		} finally {
			view.unmount();
		}
	});

	it.each([
		['render', 'NestedIf', NestedIf],
		['hydrate', 'NestedIf', NestedIf],
		['render', 'BlockDeclaration', BlockDeclaration],
		['hydrate', 'BlockDeclaration', BlockDeclaration],
	] as const)(
		'%s: a function declared in %s renders itself from an @if arm',
		(mode, name, Component) => {
			const props = { label: 'n', max: 2 };
			const view = start(mode, armsFixture, name, Component, props);
			try {
				expect(view.texts()).toEqual(['n0:0', 'n1:0', 'n2:0']);
				if (mode === 'hydrate') expectSameNodes(view.buttons(), view.adopted);
				view.click(2);
				expect(view.texts()).toEqual(['n0:0', 'n1:0', 'n2:1']);
				// Each parent render declares a new Inner, so its subtree remounts.
				view.render({ label: 'm', max: 1 });
				expect(view.texts()).toEqual(['m0:0', 'm1:0']);
				expect(view.errors).toEqual([]);
			} finally {
				view.unmount();
			}
		},
	);

	it.each(modes)('%s: export default (function Name) renders itself from an @if arm', (mode) => {
		const props = { depth: 0, max: 1 };
		const view = start(mode, defaultFixture, 'default', DefaultCounter, props);
		try {
			expect(view.texts()).toEqual(['0:0', '1:0']);
			if (mode === 'hydrate') expectSameNodes(view.buttons(), view.adopted);
			view.click(1);
			view.render({ depth: 0, max: 2 });
			expect(view.texts()).toEqual(['0:0', '1:1', '2:0']);
			expect(view.errors).toEqual([]);
		} finally {
			view.unmount();
		}
	});
});
