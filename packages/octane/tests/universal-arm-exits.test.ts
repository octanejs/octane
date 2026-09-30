import { describe, expect, it } from 'vitest';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	type ObjectHostInstance,
} from '../src/universal.js';
import {
	ArmKinds,
	ForContinue,
	IfReturn,
	InnerArmContinue,
	NestedContinue,
} from './_fixtures/universal-arm-exits.object.tsrx';

type Parent = { children: readonly ObjectHostInstance[] };

function objectRoot() {
	const container = createObjectContainer();
	const root = createUniversalRoot(container, createObjectDriver());
	return { container, root };
}

function list(container: Parent): ObjectHostInstance {
	const [only] = container.children;
	if (only?.type !== 'list') throw new Error('Missing list instance.');
	return only;
}

function names(parent: Parent): unknown[] {
	return parent.children.map((child) => child.props.name);
}

// Every exit a universal arm's setup owns ends that arm, and a later render
// that no longer takes it restores the arm's output. Before, `continue;`
// reached the arm closure verbatim and the module failed to load.
describe('universal directive arm exits', () => {
	it('skips the rows an @for body continues past, across updates and reorders', () => {
		const { container, root } = objectRoot();
		root.render(ForContinue, { rows: ['a', 'b', 'c'], hidden: ['b'] });
		expect(names(list(container))).toEqual(['a', 'c']);
		const [a, c] = list(container).children;

		root.render(ForContinue, { rows: ['c', 'b', 'a'], hidden: [] });
		expect(names(list(container))).toEqual(['c', 'b', 'a']);
		// Keyed rows keep their hosts when a hidden sibling reappears.
		expect(list(container).children[0]).toBe(c);
		expect(list(container).children[2]).toBe(a);

		root.render(ForContinue, { rows: ['c', 'b', 'a'], hidden: ['c', 'a'] });
		expect(names(list(container))).toEqual(['b']);

		root.render(ForContinue, { rows: ['a', 'b', 'c'], hidden: ['a', 'b', 'c'] });
		expect(names(list(container))).toEqual([]);

		root.render(ForContinue, { rows: ['b', 'c', 'a'], hidden: [] });
		expect(names(list(container))).toEqual(['b', 'c', 'a']);
		root.unmount();
	});

	it('ends the row at a continue nested in if, switch, and try statements', () => {
		const { container, root } = objectRoot();
		const rows = ['block', 'switch', 'try', 'loop'];
		root.render(NestedContinue, { rows, hidden: [] });
		// The inner loop's own `continue` (o) and `break` (p) stay JavaScript.
		expect(list(container).children.map((child) => [child.props.name, child.props.seen])).toEqual([
			['block', 4],
			['switch', 6],
			['try', 3],
			['loop', 1],
		]);

		root.render(NestedContinue, { rows, hidden: ['block', 'switch', 'try', 'loop'] });
		// `loop` has no exit, so hiding it changes nothing.
		expect(names(list(container))).toEqual(['loop']);

		root.render(NestedContinue, { rows, hidden: ['switch'] });
		expect(names(list(container))).toEqual(['block', 'try', 'loop']);
		root.unmount();
	});

	it('ends only the inner arm that a nested continue sits in', () => {
		const { container, root } = objectRoot();
		root.render(InnerArmContinue, { rows: ['a', 'b'], hidden: ['a'] });
		const items = list(container).children;
		expect(names(list(container))).toEqual(['a', 'b']);
		expect(names(items[0])).toEqual([]);
		expect(names(items[1])).toEqual(['b-badge']);

		root.render(InnerArmContinue, { rows: ['a', 'b'], hidden: ['b'] });
		expect(names(items[0])).toEqual(['a-badge']);
		expect(names(items[1])).toEqual([]);
		root.unmount();
	});

	it('ends @if, @else if, @case, and @try arms inside an @for row', () => {
		const { container, root } = objectRoot();
		const rows = ['a', 'b', 'c'];
		for (const [mode, prefix] of [
			[0, 'if'],
			[1, 'else-if'],
			[2, 'case'],
			[3, 'try'],
		] as const) {
			root.render(ArmKinds, { rows, hidden: ['b'], mode });
			expect(names(list(container))).toEqual([`${prefix}-a`, `${prefix}-c`]);
			root.render(ArmKinds, { rows, hidden: ['a', 'c'], mode });
			expect(names(list(container))).toEqual([`${prefix}-b`]);
		}
		root.unmount();
	});

	it('ends an @if or @else arm at return and return null', () => {
		const { container, root } = objectRoot();
		root.render(IfReturn, { a: true, b: false, c: false });
		expect(names(list(container))).toEqual(['before', 'a', 'after']);
		root.render(IfReturn, { a: true, b: true, c: false });
		expect(names(list(container))).toEqual(['before', 'after']);
		root.render(IfReturn, { a: false, b: true, c: false });
		expect(names(list(container))).toEqual(['before', 'else', 'after']);
		root.render(IfReturn, { a: false, b: true, c: true });
		expect(names(list(container))).toEqual(['before', 'after']);
		root.render(IfReturn, { a: true, b: false, c: true });
		expect(names(list(container))).toEqual(['before', 'a', 'after']);
		root.unmount();
	});
});
