// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler/compile.js';
import {
	Children,
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	descriptorChildren,
	universalChildren,
	universalIf,
	universalKey,
	universalPlan,
	universalProps,
	universalValue,
	type ObjectHostContainer,
	type UniversalRenderable,
} from '../src/universal.js';

const RENDERER = 'children-test';

const hostPlan = universalPlan(RENDERER, {
	kind: 'host',
	type: 'item',
	propsSlot: 0,
});
const textPlan = universalPlan(RENDERER, { kind: 'text', slot: 0 });
const pairPlan = universalPlan(RENDERER, {
	kind: 'range',
	children: [
		{ kind: 'host', type: 'item', propsSlot: 0 },
		{ kind: 'host', type: 'item', propsSlot: 1 },
	],
});

function item(id: string): UniversalRenderable {
	return universalValue(hostPlan, [universalProps([['set', 'id', id]])]);
}

function names(container: ObjectHostContainer): string[] {
	return container.children.map((child) => child.props['id'] as string);
}

function objectRoot() {
	const container = createObjectContainer(RENDERER);
	const root = createUniversalRoot(container, createObjectDriver(RENDERER));
	return { container, root };
}

describe('universal children', () => {
	it('compiles Children and descriptorChildren imports routed to the renderer module', () => {
		const source = `
import { Children, descriptorChildren } from 'octane';
const List = descriptorChildren(function List(props) { return Children.toArray(props.children); });
export function Scene() @{ <view>{List({ children: null })}</view> }
`;
		const compiled = compile(source, '/src/Scene.object.tsrx', {
			hmr: false,
			renderer: { id: 'object', module: 'octane/universal', target: 'universal', text: 'host' },
		});
		expect(compiled.code).toContain("from 'octane/universal'");
		expect(compiled.code).toMatch(/import\s*\{[^}]*\bChildren\b/);
	});

	it('normalizes sibling JSX children to one entry per child', () => {
		const children = universalChildren(RENDERER, () =>
			universalValue(pairPlan, [
				universalProps([['set', 'id', 'a']]),
				universalProps([['set', 'id', 'b']]),
			]),
		);
		expect(Children.toArray(children)).toHaveLength(2);
	});

	it('keeps map-produced keys and host identity across reorders', () => {
		const { container, root } = objectRoot();
		const List = defineUniversalComponent(RENDERER, (props: { children?: UniversalRenderable }) =>
			Children.toArray(props.children),
		);
		const rows = ['a', 'b'].map((id) => universalKey(id, item(id)));
		root.render(List, { children: universalChildren(RENDERER, () => rows) });
		const first = container.children[0];
		expect(names(container)).toEqual(['a', 'b']);
		root.render(List, {
			children: universalChildren(RENDERER, () => [rows[1], rows[0]]),
		});
		expect(names(container)).toEqual(['b', 'a']);
		expect(container.children[1]).toBe(first);
	});

	it('propagates child keys to map wrappers across a reorder', () => {
		const { container, root } = objectRoot();
		const Wrap = defineUniversalComponent(RENDERER, (props: { children?: UniversalRenderable }) =>
			Children.map(props.children, (child) => child),
		);
		const rows = ['x', 'y'].map((id) => universalKey(id, item(id)));
		root.render(Wrap, { children: universalChildren(RENDERER, () => rows) });
		const first = container.children[0];
		expect(names(container)).toEqual(['x', 'y']);
		root.render(Wrap, {
			children: universalChildren(RENDERER, () => [rows[1], rows[0]]),
		});
		expect(names(container)).toEqual(['y', 'x']);
		expect(container.children[1]).toBe(first);
	});

	it('keeps scoped blocks and conditionals as single opaque entries', () => {
		const children = universalChildren(RENDERER, () => [
			item('a'),
			universalIf(true, () => item('scoped')),
			null,
			false,
		]);
		const entries = Children.toArray(children);
		expect(entries).toHaveLength(2);
	});

	it('encodes symbol and bigint keys distinctly', () => {
		const { container, root } = objectRoot();
		const List = defineUniversalComponent(RENDERER, (props: { children?: UniversalRenderable }) =>
			Children.toArray(props.children),
		);
		const rows = [
			universalKey(Symbol('a'), item('first')),
			universalKey(Symbol('a'), item('second')),
			universalKey(1n, item('bigint')),
			universalKey('1', item('string')),
			universalKey(1, item('number')),
		];
		const entries = Children.toArray(rows);
		const keys = entries.map((entry) => (entry as { key?: unknown }).key);
		expect(new Set(keys).size).toBe(5);
		root.render(List, { children: universalChildren(RENDERER, () => rows) });
		const first = container.children[0];
		expect(names(container)).toEqual(['first', 'second', 'bigint', 'string', 'number']);
		root.render(List, {
			children: universalChildren(RENDERER, () => [rows[4], rows[3], rows[2], rows[1], rows[0]]),
		});
		expect(names(container)).toEqual(['number', 'string', 'bigint', 'second', 'first']);
		expect(container.children[4]).toBe(first);
	});

	it('keeps an unkeyed fragment positional instead of adopting its child key', () => {
		const { container, root } = objectRoot();
		const List = defineUniversalComponent(RENDERER, (props: { children?: UniversalRenderable }) =>
			Children.toArray(props.children),
		);
		root.render(List, {
			children: universalChildren(RENDERER, () => [
				universalKey('k', item('keyed')),
				universalValue(
					universalPlan(RENDERER, {
						kind: 'range',
						children: [{ kind: 'host', type: 'item', propsSlot: 0 }],
					}),
					[
						universalProps([
							['set', 'id', 'frag'],
							['set', 'key', 'k'],
						]),
					],
				),
			]),
		});
		expect(names(container)).toEqual(['keyed', 'frag']);
	});

	it('returns nullish input from map unchanged', () => {
		expect(Children.map(null, (child) => child)).toBe(null);
		expect(Children.map(undefined, (child) => child)).toBe(undefined);
	});

	it('drops null and boolean children', () => {
		expect(Children.toArray([item('a'), null, false, true])).toHaveLength(1);
	});

	it('renders a descriptorChildren list the same under the universal renderer', () => {
		const { container, root } = objectRoot();
		const List = descriptorChildren(
			defineUniversalComponent(RENDERER, (props: { children?: UniversalRenderable }) =>
				Children.map(props.children, (child) => child),
			),
		);
		root.render(List, {
			children: universalChildren(RENDERER, () => [item('one'), item('two')]),
		});
		expect(names(container)).toEqual(['one', 'two']);
	});
});
