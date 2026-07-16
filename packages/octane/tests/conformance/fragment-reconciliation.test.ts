import { describe, expect, it, vi } from 'vitest';
import { act } from 'octane';
import { mount } from '../_helpers';
import * as Fixture from './_fixtures/fragment-reconciliation.tsrx';

type Scenario = (props: { condition: boolean; allocate: () => string }) => unknown;

function exerciseStateTransition(component: Scenario, preserve: boolean) {
	let nextInstance = 0;
	const allocate = () => String(++nextInstance);
	const r = mount(component as any, { condition: true, allocate });
	const first = r.find('.stateful').getAttribute('data-instance');

	r.update(component as any, { condition: false, allocate });
	const second = r.find('.stateful').getAttribute('data-instance');

	r.update(component as any, { condition: true, allocate });
	const third = r.find('.stateful').getAttribute('data-instance');

	if (preserve) {
		expect([first, second, third]).toEqual(['1', '1', '1']);
	} else {
		expect([first, second, third]).toEqual(['1', '2', '3']);
	}
	r.unmount();
}

describe('React Fragment reconciliation conformance', () => {
	// Per ReactFragment-test.js:29.
	it('should render a single child via noop renderer', () => {
		const r = mount(Fixture.RenderSingleFragment);
		expect(r.find('span').textContent).toBe('foo');
		expect(r.findAll('span')).toHaveLength(1);
		r.unmount();
	});

	// Per ReactFragment-test.js:42.
	it('should render zero children via noop renderer', () => {
		const r = mount(Fixture.RenderEmptyFragment);
		expect(r.container.textContent).toBe('');
		expect(r.container.children).toHaveLength(0);
		r.unmount();
	});

	// Per ReactFragment-test.js:51.
	it('should render multiple children via noop renderer', () => {
		const r = mount(Fixture.RenderMultipleFragmentChildren);
		expect(r.container.textContent).toBe('hello world');
		expect(r.find('span').textContent).toBe('world');
		r.unmount();
	});

	// Per ReactFragment-test.js:68.
	it('should render an iterable via noop renderer', () => {
		const r = mount(Fixture.RenderIterableFragmentChildren);
		expect(r.findAll('span').map((node) => node.textContent)).toEqual(['hi', 'bye']);
		r.unmount();
	});

	// Per ReactFragment-test.js:84.
	it('should preserve state of children with 1 level nesting', () => {
		exerciseStateTransition(Fixture.OneLevelNesting, true);
	});

	// Per ReactFragment-test.js:129.
	it('should preserve state between top-level fragments', () => {
		exerciseStateTransition(Fixture.TopLevelFragments, true);
	});

	// Per ReactFragment-test.js:170.
	it('should preserve state of children nested at same level', () => {
		exerciseStateTransition(Fixture.NestedAtSameLevel, true);
	});

	// Per ReactFragment-test.js:225.
	it('should not preserve state in non-top-level fragment nesting', () => {
		exerciseStateTransition(Fixture.NonTopLevelNesting, false);
	});

	// Per ReactFragment-test.js:268.
	it('should not preserve state of children if nested 2 levels without siblings', () => {
		exerciseStateTransition(Fixture.TwoLevelsWithoutSiblings, false);
	});

	// Per ReactFragment-test.js:309.
	it('should not preserve state of children if nested 2 levels with siblings', () => {
		exerciseStateTransition(Fixture.TwoLevelsWithSiblings, false);
	});

	// Per ReactFragment-test.js:356.
	it('should preserve state between array nested in fragment and fragment', () => {
		exerciseStateTransition(Fixture.ArrayInFragmentToFragment, true);
	});

	// Per ReactFragment-test.js:395.
	it('should preserve state between top level fragment and array', () => {
		exerciseStateTransition(Fixture.TopLevelFragmentToArray, true);
	});

	// Per ReactFragment-test.js:434.
	it('should not preserve state between array nested in fragment and double nested fragment', () => {
		exerciseStateTransition(Fixture.ArrayInFragmentToDoubleFragment, false);
	});

	// Per ReactFragment-test.js:475.
	it('should not preserve state between array nested in fragment and double nested array', () => {
		exerciseStateTransition(Fixture.ArrayInFragmentToDoubleArray, false);
	});

	// Per ReactFragment-test.js:512.
	it('should preserve state between double nested fragment and double nested array', () => {
		exerciseStateTransition(Fixture.DoubleFragmentToDoubleArray, true);
	});

	// Per ReactFragment-test.js:553.
	it('should not preserve state of children when the keys are different', () => {
		exerciseStateTransition(Fixture.DifferentFragmentKeys, false);
	});

	// Per ReactFragment-test.js:600.
	it('should not preserve state between unkeyed and keyed fragment', () => {
		exerciseStateTransition(Fixture.KeyedToUnkeyedFragment, false);
	});

	// ReactFragment-test.js:553/:600 require implicit positions and explicit keys
	// to remain distinct identities, even when their textual forms are both "0".
	it('does not alias an implicit index with an explicit numeric-looking key', () => {
		let nextInstance = 0;
		const allocate = () => String(++nextInstance);
		const r = mount(Fixture.NestedImplicitAndExplicitZeroKeys, {
			condition: true,
			allocate,
		});
		expect(r.findAll('.stateful').map((node) => node.getAttribute('data-instance'))).toEqual([
			'1',
			'2',
		]);

		r.update(Fixture.NestedImplicitAndExplicitZeroKeys, { condition: false, allocate });
		expect(r.findAll('.stateful').map((node) => node.getAttribute('data-instance'))).toEqual(['2']);

		r.update(Fixture.NestedImplicitAndExplicitZeroKeys, { condition: true, allocate });
		expect(r.findAll('.stateful').map((node) => node.getAttribute('data-instance'))).toEqual([
			'3',
			'2',
		]);
		r.unmount();
	});

	// Per ReactFragment-test.js:641.
	it('should preserve state with reordering in multiple levels', () => {
		exerciseStateTransition(Fixture.ReorderAcrossLevels, true);
	});

	// Per ReactFragment-test.js:710.
	it('should not preserve state when switching to a keyed fragment to an array', () => {
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
		exerciseStateTransition(Fixture.KeyedFragmentToArray, false);
		expect(warning).toHaveBeenCalledWith(expect.stringContaining('unique "key" prop'));
	});

	// Per ReactFragment-test.js:775.
	it('should not preserve state when switching a nested unkeyed fragment to a passthrough component', () => {
		exerciseStateTransition(Fixture.NestedUnkeyedFragmentToPassthrough, false);
	});

	// Per ReactFragment-test.js:824.
	it('should not preserve state when switching a nested keyed fragment to a passthrough component', () => {
		exerciseStateTransition(Fixture.NestedKeyedFragmentToPassthrough, false);
	});

	// Per ReactFragment-test.js:873.
	it('should not preserve state when switching a nested keyed array to a passthrough component', () => {
		exerciseStateTransition(Fixture.NestedKeyedArrayToPassthrough, false);
	});

	// Per ReactFragment-test.js:918.
	it('should preserve state when it does not change positions', () => {
		exerciseStateTransition(Fixture.SamePositions, true);
	});

	// Per ReactFragment-test.js:984.
	// UPSTREAM NON-GOAL: React's internal renderer test resolves lazy() to an
	// element, outside the documented lazy() contract. This adaptation uses a
	// component module; adding that component is an identity boundary and remounts.
	it('should preserve state of children when adding a fragment wrapped in Lazy', async () => {
		let nextInstance = 0;
		const allocate = () => String(++nextInstance);
		const r = mount(Fixture.AddLazyFragmentBoundary as any, { condition: true, allocate });
		expect(r.find('.stateful').getAttribute('data-instance')).toBe('1');
		r.update(Fixture.AddLazyFragmentBoundary as any, { condition: false, allocate });
		await act(() => Promise.resolve());
		expect(r.find('.stateful').getAttribute('data-instance')).toBe('2');
		r.unmount();
	});
});

describe('React top-level Fragment reconciliation conformance', () => {
	// Per ReactTopLevelFragment-test.js:29.
	it('should render a simple fragment at the top of a component', () => {
		const r = mount(Fixture.TopLevelSimpleFragment);
		expect(r.findAll('div').map((node) => node.textContent)).toEqual(['Hello', 'World']);
		r.unmount();
	});

	// Per ReactTopLevelFragment-test.js:37.
	it('should preserve state when switching from a single child', () => {
		exerciseStateTransition(Fixture.TopLevelSingleToArray, true);
	});

	// Per ReactTopLevelFragment-test.js:69.
	it('should not preserve state when switching to a nested array', () => {
		exerciseStateTransition(Fixture.TopLevelSingleToNestedArray, false);
	});

	// Per ReactTopLevelFragment-test.js:101.
	it('preserves state if an implicit key slot switches from/to null', () => {
		exerciseStateTransition(Fixture.TopLevelImplicitNullSlot, true);
	});

	// Per ReactTopLevelFragment-test.js:138.
	it('should preserve state in a reorder', () => {
		exerciseStateTransition(Fixture.TopLevelNestedReorder, true);
	});
});
