import { describe, expect, it } from 'vitest';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	type ObjectHostInstance,
} from '../src/universal.js';
import {
	AttributeComponentRows,
	AttributeHostRows,
	HeaderComponentRows,
	HeaderHostRows,
	NestedKeyRows,
	PositionalRows,
	PrecedenceRows,
} from './_fixtures/universal-for-row-key.object.tsrx';

type Rows = typeof AttributeHostRows;

function instances(parent: { children: readonly ObjectHostInstance[] }, type: string) {
	const output: ObjectHostInstance[] = [];
	const visit = (node: { children: readonly ObjectHostInstance[] }) => {
		for (const child of node.children) {
			if (child.type === type) output.push(child);
			visit(child);
		}
	};
	visit(parent);
	return output;
}

// Renders a, b, c, then reverses them, and reports each row's mount token and
// host instance before and after.
function reverseRows(Scene: Rows) {
	const container = createObjectContainer();
	const root = createUniversalRoot(container, createObjectDriver());
	let mounts = 0;
	const allocate = () => `mount-${++mounts}`;
	const snapshot = () =>
		instances(container, 'row-state').map((state) => [state.props.id, state.props.mount]);
	const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
	root.render(Scene, { rows, allocate });
	const before = { states: snapshot(), hosts: instances(container, 'row-host') };
	root.render(Scene, { rows: [...rows].reverse(), allocate });
	const after = { states: snapshot(), hosts: instances(container, 'row-host') };
	root.unmount();
	return { before, after, mounts };
}

describe('universal @for root key attribute', () => {
	it('keys intrinsic rows by the root attribute across a reorder', () => {
		const { before, after, mounts } = reverseRows(AttributeHostRows);
		expect(before.states).toEqual([
			['a', 'mount-1'],
			['b', 'mount-2'],
			['c', 'mount-3'],
		]);
		expect(after.states).toEqual([
			['c', 'mount-3'],
			['b', 'mount-2'],
			['a', 'mount-1'],
		]);
		expect(mounts).toBe(3);
		// The row's host moves with its item rather than remounting.
		expect(after.hosts.map((host) => host.props.id)).toEqual(['c', 'b', 'a']);
		for (let index = 0; index < 3; index++) {
			expect(after.hosts[index]).toBe(before.hosts[2 - index]);
		}
		expect(after.hosts[0].props).not.toHaveProperty('key');
	});

	it('keys component rows by the root attribute across a reorder', () => {
		const { after, mounts } = reverseRows(AttributeComponentRows);
		expect(after.states).toEqual([
			['c', 'mount-3'],
			['b', 'mount-2'],
			['a', 'mount-1'],
		]);
		expect(mounts).toBe(3);
	});

	it('prefers the root attribute over a header key', () => {
		const { after, mounts } = reverseRows(PrecedenceRows);
		expect(after.states).toEqual([
			['c', 'mount-3'],
			['b', 'mount-2'],
			['a', 'mount-1'],
		]);
		expect(mounts).toBe(3);
	});

	it('matches the header spelling', () => {
		const attributeHosts = reverseRows(AttributeHostRows);
		const headerHosts = reverseRows(HeaderHostRows);
		expect(attributeHosts.after.states).toEqual(headerHosts.after.states);
		expect(attributeHosts.mounts).toBe(headerHosts.mounts);
		expect(reverseRows(AttributeComponentRows).after.states).toEqual(
			reverseRows(HeaderComponentRows).after.states,
		);
	});

	it('keeps state with the slot when no key is written', () => {
		// The control: without any key, the same reorder moves state to the slot.
		const { after, mounts } = reverseRows(PositionalRows);
		expect(after.states).toEqual([
			['c', 'mount-1'],
			['b', 'mount-2'],
			['a', 'mount-3'],
		]);
		expect(mounts).toBe(3);
	});

	it("keeps a key below the root as that element's own boundary", () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		let mounts = 0;
		const allocate = () => `mount-${++mounts}`;
		root.render(NestedKeyRows, {
			rows: [
				{ id: 'a', version: 1 },
				{ id: 'b', version: 1 },
			],
			allocate,
		});
		const [a, b] = instances(container, 'row-host');
		root.render(NestedKeyRows, {
			rows: [
				{ id: 'b', version: 1 },
				{ id: 'a', version: 2 },
			],
			allocate,
		});
		// Both rows move with their items; only the child whose key changed remounts.
		expect(instances(container, 'row-host')[0]).toBe(b);
		expect(instances(container, 'row-host')[1]).toBe(a);
		expect(
			instances(container, 'row-state').map((state) => [state.props.id, state.props.mount]),
		).toEqual([
			['b', 'mount-2'],
			['a', 'mount-3'],
		]);
		root.unmount();
	});
});
