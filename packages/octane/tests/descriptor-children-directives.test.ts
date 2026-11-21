import { describe, expect, it } from 'vitest';
import { Children, flushSync, hydrateRoot, isValidElement } from 'octane';
import { renderToString } from 'octane/server';
import { mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import {
	ForChildren,
	IfChildren,
	Item,
	NestedForChildren,
	SetupArmChildren,
} from './_fixtures/descriptor-children-directives.tsrx';

const server = loadServerFixture(
	'packages/octane/tests/_fixtures/descriptor-children-directives.tsrx',
);

// What a part that walks its children sees: host tags by name, Item by
// identity, and the key Children.toArray assigned.
function describeChild(child: any, item: unknown): string {
	if (!isValidElement(child)) return String(child);
	const { type, key } = child as { type: unknown; key: string | null };
	const name = type === item ? 'Item' : typeof type === 'string' ? type : 'opaque';
	return key === null ? name : `${name}${key}`;
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
