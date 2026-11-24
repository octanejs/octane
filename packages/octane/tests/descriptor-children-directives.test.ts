import { describe, expect, it } from 'vitest';
import { Children, flushSync, Fragment, hydrateRoot, isValidElement } from 'octane';
import { renderToString } from 'octane/server';
import { mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import {
	ForChildren,
	IfChildren,
	Item,
	KeyedFragmentRows,
	KeyedGroupRows,
	KeyedIfRows,
	KeyedSetupArmRows,
	KeylessIfRows,
	NestedForChildren,
	SetupArmChildren,
	ValuelessKeyRows,
} from './_fixtures/descriptor-children-directives.tsrx';

const server = loadServerFixture(
	'packages/octane/tests/_fixtures/descriptor-children-directives.tsrx',
);

// What a part that walks its children sees: host tags by name, Item by
// identity, and the key Children.toArray assigned. A Fragment also lists the
// elements it holds, as a part reading its props.children would.
function describeChild(child: any, item: unknown): string {
	if (!isValidElement(child)) return String(child);
	const { type, key, props } = child as {
		type: unknown;
		key: string | null;
		props: { children?: unknown };
	};
	const name =
		type === item
			? 'Item'
			: type === Fragment
				? 'Fragment'
				: typeof type === 'string'
					? type
					: 'opaque';
	const label = key === null ? name : `${name}${key}`;
	if (type !== Fragment) return label;
	const inner = Children.toArray(props.children).map((element) => describeChild(element, item));
	return `${label}[${inner.join(' ')}]`;
}

function inspector(item: unknown = Item) {
	const seen: string[][] = [];
	const nested: string[][] = [];
	return {
		seen,
		nested,
		inspect: (children: unknown[]) => {
			seen.push(children.map((child) => describeChild(child, item)));
			const host = children[0] as { props?: { children?: unknown } };
			nested.push(
				Children.toArray(host?.props?.children).map((child) => describeChild(child, item)),
			);
		},
	};
}

describe('descriptorChildren template directives', () => {
	it('passes the elements of a chosen @if arm to a marked part, like a conditional', () => {
		const shown = inspector();
		const a = mount(IfChildren, { shown: true, other: false, inspect: shown.inspect });
		expect(shown.seen.at(-1)).toEqual(['b.0', 'i.1', 'u.2']);
		expect(a.container.querySelector('i')).not.toBeNull();
		a.unmount();

		const other = inspector();
		const b = mount(IfChildren, { shown: false, other: true, inspect: other.inspect });
		expect(other.seen.at(-1)).toEqual(['b.0', 's.1']);
		b.unmount();

		const none = inspector();
		const c = mount(IfChildren, { shown: false, other: false, inspect: none.inspect });
		expect(none.seen.at(-1)).toEqual(['b.0']);
		expect(c.container.innerHTML).not.toContain('<i');
		c.unmount();
	});

	it('passes @for rows to a marked part as keyed elements and keeps them in order', () => {
		const { seen, inspect } = inspector();
		const mounted = mount(ForChildren, { ids: ['a', 'b'], inspect });
		expect(seen.at(-1)).toEqual(['Item.$a', 'Item.$b']);
		const first = mounted.container.querySelector('.item');
		expect(mounted.container.textContent).toBe('ab');

		flushSync(() => mounted.root.render(ForChildren, { ids: ['c', 'b', 'a'], inspect }));
		expect(seen.at(-1)).toEqual(['Item.$c', 'Item.$b', 'Item.$a']);
		expect(mounted.container.textContent).toBe('cba');
		// Keyed rows keep their identity across the reorder.
		expect(mounted.container.querySelectorAll('.item')[2]).toBe(first);
		mounted.unmount();
	});

	it('keys @for rows whose own key is valueless by the header key', () => {
		const { seen, inspect } = inspector();
		const mounted = mount(ValuelessKeyRows, { ids: ['a', 'b'], inspect });
		expect(seen.at(-1)).toEqual(['Item.$a', 'Item.$b']);
		const first = mounted.container.querySelector('.item');

		flushSync(() => mounted.root.render(ValuelessKeyRows, { ids: ['c', 'b', 'a'], inspect }));
		expect(seen.at(-1)).toEqual(['Item.$c', 'Item.$b', 'Item.$a']);
		expect(mounted.container.textContent).toBe('cba');
		expect(mounted.container.querySelectorAll('.item')[2]).toBe(first);
		mounted.unmount();
	});

	it('lowers directives nested in a host child of a marked part', () => {
		const { seen, nested, inspect } = inspector();
		const mounted = mount(NestedForChildren, { ids: ['a', 'b', 'c'], inspect });
		expect(seen.at(-1)).toEqual(['section.0']);
		expect(nested.at(-1)).toEqual(['Item.1', 'Item.2']);
		expect(mounted.container.textContent).toBe('bc');
		mounted.unmount();
	});

	it('keeps a setup-bearing arm renderable as one compiled fragment', () => {
		const { seen, inspect } = inspector();
		const mounted = mount(SetupArmChildren, { shown: true, inspect });
		expect(seen.at(-1)).toEqual(['opaque.0']);
		expect(mounted.container.querySelector('i')?.textContent).toBe('setup');
		mounted.unmount();

		const keyed = mount(KeyedSetupArmRows, { ids: ['a', 'b', 'c'], inspect });
		expect(seen.at(-1)).toEqual(['opaque.0']);
		expect(keyed.container.textContent).toBe('a!c!');
		keyed.unmount();
	});

	it('carries a keyed @for header key onto the elements of a nested @if row', () => {
		const { seen, inspect } = inspector();
		const mounted = mount(KeyedIfRows, { ids: ['a', 'b', 'c'], hidden: 'b', inspect });
		expect(seen.at(-1)).toEqual(['Item.$a', 'Item.$c']);
		expect(mounted.container.textContent).toBe('ac');
		const c = mounted.container.querySelectorAll('.item')[1];

		flushSync(() =>
			mounted.root.render(KeyedIfRows, { ids: ['a', 'b', 'c'], hidden: 'a', inspect }),
		);
		expect(seen.at(-1)).toEqual(['Item.$b', 'Item.$c']);
		expect(mounted.container.textContent).toBe('bc');
		// The header key, not the position, identifies the surviving row.
		expect(mounted.container.querySelectorAll('.item')[1]).toBe(c);
		mounted.unmount();
	});

	it('gives keyed and keyless lists over the same nested @if the same elements', () => {
		const props = { ids: ['a', 'b', 'c'], hidden: 'b' };
		const elements = (component: typeof KeyedIfRows) => {
			const received: unknown[][] = [];
			const mounted = mount(component, {
				...props,
				inspect: (children) => received.push(children),
			});
			const text = mounted.container.textContent;
			mounted.unmount();
			const children = received.at(-1) as { type: unknown; key: string; props: any }[];
			return {
				text,
				keys: children.map((child) => child.key),
				elements: children.map((child) => [child.type, child.props.value]),
			};
		};
		const keyed = elements(KeyedIfRows);
		const keyless = elements(KeylessIfRows);
		expect(keyed.elements).toEqual([
			[Item, 'a'],
			[Item, 'c'],
		]);
		expect(keyless.elements).toEqual(keyed.elements);
		expect(keyed.text).toBe('ac');
		expect(keyless.text).toBe(keyed.text);
		// Only the identity differs: the header key, or the row's position.
		expect(keyed.keys).toEqual(['.$a', '.$c']);
		expect(keyless.keys).toEqual(['.0', '.2']);
	});

	it('wraps a keyed @for row that is a nested @for in a keyed Fragment', () => {
		const { seen, inspect } = inspector();
		const groups = [
			{ id: 'x', items: ['a', 'b'] },
			{ id: 'y', items: ['c'] },
		];
		const mounted = mount(KeyedGroupRows, { groups, inspect });
		expect(seen.at(-1)).toEqual(['Fragment.$x[Item.$a Item.$b]', 'Fragment.$y[Item.$c]']);
		expect(mounted.container.textContent).toBe('abc');
		const c = mounted.container.querySelectorAll('.item')[2];

		flushSync(() =>
			mounted.root.render(KeyedGroupRows, { groups: [groups[1], groups[0]], inspect }),
		);
		expect(seen.at(-1)).toEqual(['Fragment.$y[Item.$c]', 'Fragment.$x[Item.$a Item.$b]']);
		expect(mounted.container.textContent).toBe('cab');
		expect(mounted.container.querySelectorAll('.item')[0]).toBe(c);
		mounted.unmount();
	});

	it('wraps a keyed @for row or arm that is a fragment in a keyed Fragment', () => {
		const { seen, inspect } = inspector();
		const mounted = mount(KeyedFragmentRows, { ids: ['a', 'b'], paired: 'b', inspect });
		expect(seen.at(-1)).toEqual([
			'Fragment.0:$a[Item.0 b.1]',
			'Fragment.0:$b[Item.0 b.1]',
			'Item.1:$a',
			'Fragment.1:$b[Item.0 b.1]',
		]);
		expect(mounted.container.textContent).toBe('aabbabb');
		mounted.unmount();
	});

	it('hydrates keyed @for rows that are nested blocks from matching server descriptors', () => {
		for (const [component, serverComponent, props, expected, text] of [
			[
				KeyedIfRows,
				server.KeyedIfRows,
				{ ids: ['a', 'b', 'c'], hidden: 'b' },
				['Item.$a', 'Item.$c'],
				'ac',
			],
			[
				KeyedGroupRows,
				server.KeyedGroupRows,
				{
					groups: [
						{ id: 'x', items: ['a', 'b'] },
						{ id: 'y', items: ['c'] },
					],
				},
				['Fragment.$x[Item.$a Item.$b]', 'Fragment.$y[Item.$c]'],
				'abc',
			],
			[
				KeyedFragmentRows,
				server.KeyedFragmentRows,
				{ ids: ['a', 'b'], paired: 'b' },
				[
					'Fragment.0:$a[Item.0 b.1]',
					'Fragment.0:$b[Item.0 b.1]',
					'Item.1:$a',
					'Fragment.1:$b[Item.0 b.1]',
				],
				'aabbabb',
			],
		] as const) {
			const serverSeen = inspector(server.Item);
			const html = renderToString(serverComponent, {
				...props,
				inspect: serverSeen.inspect,
			}).html;
			const container = document.createElement('div');
			container.innerHTML = html;
			document.body.appendChild(container);
			const adopted = Array.from(container.querySelectorAll('*'));
			const clientSeen = inspector();
			const root = hydrateRoot(container, component as any, {
				...props,
				inspect: clientSeen.inspect,
			});
			try {
				expect(serverSeen.seen.at(-1)).toEqual(expected);
				expect(clientSeen.seen.at(-1)).toEqual(expected);
				expect(container.textContent).toBe(text);
				expect(Array.from(container.querySelectorAll('*'))).toEqual(adopted);
			} finally {
				root.unmount();
				container.remove();
			}
		}
	});

	it('server-renders the same descriptors the client hydrates', () => {
		for (const [component, serverComponent, props, text] of [
			[IfChildren, server.IfChildren, { shown: true, other: false }, ''],
			[ForChildren, server.ForChildren, { ids: ['a', 'b'] }, 'ab'],
			[NestedForChildren, server.NestedForChildren, { ids: ['a', 'b', 'c'] }, 'bc'],
		] as const) {
			const serverSeen = inspector(server.Item);
			const html = renderToString(serverComponent, {
				...props,
				inspect: serverSeen.inspect,
			}).html;
			const container = document.createElement('div');
			container.innerHTML = html;
			document.body.appendChild(container);
			const adopted = Array.from(container.querySelectorAll('*'));
			const clientSeen = inspector();
			const root = hydrateRoot(container, component as any, {
				...props,
				inspect: clientSeen.inspect,
			});
			try {
				expect(clientSeen.seen.at(-1)).toEqual(serverSeen.seen.at(-1));
				expect(clientSeen.nested.at(-1)).toEqual(serverSeen.nested.at(-1));
				expect(container.textContent).toBe(text);
				expect(Array.from(container.querySelectorAll('*'))).toEqual(adopted);
			} finally {
				root.unmount();
				container.remove();
			}
		}
	});
});
