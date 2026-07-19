import { describe, it, expect } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import {
	buildFlat,
	buildSectioned,
	buildDynamic,
	rebuild,
	StaticChildrenHarness,
	StaticMultiChildrenHarness,
} from './_fixtures/collections-engine.tsx';

describe('@octanejs/aria/stately — collection building', () => {
	it('builds item nodes from a descriptor array with keys, textValue, and rendered content', () => {
		const nodes = buildFlat();
		expect(nodes.map((n) => n.key)).toEqual(['a', 'b']);
		expect(nodes.map((n) => n.type)).toEqual(['item', 'item']);
		// Primitive children pass through descriptors as plain strings, so textValue
		// derives from rendered text exactly as upstream; element children fall back
		// to the explicit textValue prop.
		expect(nodes[0].textValue).toBe('Alpha');
		expect(nodes[0].rendered).toBe('Alpha');
		expect(nodes[1].textValue).toBe('Beta');
		expect(nodes.map((n) => n.index)).toEqual([0, 1]);
		expect(nodes.map((n) => n.level)).toEqual([0, 0]);
	});

	it('builds sections whose child items are reachable through childNodes with prefixed keys', () => {
		const nodes = buildSectioned();
		expect(nodes.map((n) => n.type)).toEqual(['section', 'item']);
		expect(nodes[0].rendered).toBe('Fruits');
		expect(nodes[0].hasChildNodes).toBe(true);
		const children = [...nodes[0].childNodes];
		expect(children.map((n) => n.type)).toEqual(['item', 'item']);
		expect(children.map((n) => n.textValue)).toEqual(['Apple', 'Banana']);
		expect(children.map((n) => n.parentKey)).toEqual([nodes[0].key, nodes[0].key]);
		expect(nodes[1].key).toBe('other');
	});

	it('builds dynamic collections from items + a render function, deriving keys from item ids', () => {
		const items = [
			{ id: 'x', name: 'Xen' },
			{ id: 'y', name: 'Yak' },
		];
		const { nodes } = buildDynamic(items);
		expect(nodes.map((n) => n.key)).toEqual(['x', 'y']);
		expect(nodes.map((n) => n.textValue)).toEqual(['Xen', 'Yak']);
		expect(nodes.map((n) => n.value)).toEqual(items);
	});

	it('reuses cached nodes for unchanged item values across rebuilds', () => {
		const items = [
			{ id: 'x', name: 'Xen' },
			{ id: 'y', name: 'Yak' },
		];
		const { builder, nodes } = buildDynamic(items);
		// Same value objects, new array order: cached nodes are reused with updated indices.
		const again = rebuild(builder, [items[1], items[0]]);
		expect(again.map((n) => n.key)).toEqual(['y', 'x']);
		expect(again[0]).toBe(nodes[1]);
		expect(again[1]).toBe(nodes[0]);
		expect(again.map((n) => n.index)).toEqual([0, 1]);
	});

	it('walks literal static <Item> children passed through a component', async () => {
		// Component-only children compile to positional descriptors (not a children
		// block), so the builder walks literal static collections too — narrower
		// than the planned divergence, and worth pinning as a contract.
		const r = mount(StaticChildrenHarness);
		const out = r.container.querySelector('output')!;
		expect(out.textContent).toBe('no error');
		expect(out.getAttribute('data-keys')).toBe('a');
		r.unmount();

		const r2 = mount(StaticMultiChildrenHarness);
		const out2 = r2.container.querySelector('output')!;
		expect(out2.textContent).toBe('no error');
		expect(out2.getAttribute('data-keys')).toBe('a,b');
		r2.unmount();
	});
});
