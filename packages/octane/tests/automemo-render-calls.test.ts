import { describe, it, expect, afterEach } from 'vitest';
import { mount } from './_helpers';
import {
	LiveViaMemberCall,
	LiveViaModuleHelper,
	LiveViaTransitiveHelper,
	LiveViaLocalArrow,
	LiveViaStableLocal,
	LiveViaLocalFunction,
	LiveViaReassignedHelper,
	LiveViaProjectedArgument,
	ProjectionModuleHelper,
	ProjectionTransitive,
	ProjectionImported,
	HookInRegion,
	CtxUnderRegion,
	CallSiteParent,
	setLive,
	resetLive,
	bumpLabels,
	resetLabelSetters,
} from './_fixtures/automemo-render-calls.tsrx';

// Automatic memoization is a production-compile transform, so the assertions
// below only exercise a cached region under the `octane-prod` project. They are
// written as ordinary behavioral tests because the contract they protect —
// "what reaches the DOM after a re-render" — is identical in both modes.

afterEach(() => {
	resetLive();
	resetLabelSetters();
});

// Each case renders a list whose array identity AND item objects are stable
// across renders; only state behind an accessor moves. A region memoized on
// that stable identity would freeze the output, so an unrelated parent
// re-render surfacing the new value is the oracle.
const liveCases: Array<[string, any, string, string, [string, string]]> = [
	['a direct member call', LiveViaMemberCall, '#lmc-go', '.lmc-row', ['r1:', 'r2:']],
	[
		'a module helper calling a method on its parameter',
		LiveViaModuleHelper,
		'#lmh-go',
		'.lmh-row',
		['r1:', 'r2:'],
	],
	[
		'a module helper two frames from the accessor',
		LiveViaTransitiveHelper,
		'#lth-go',
		'.lth-row',
		['r1:', 'r2:'],
	],
	['a component-local arrow callee', LiveViaLocalArrow, '#lla-go', '.lla-row', ['r1:', 'r2:']],
	[
		'a component-local callee with a stable identity',
		LiveViaStableLocal,
		'#lsl-go',
		'.lsl-row',
		['r1:', 'r2:'],
	],
	[
		'a component-local function declaration',
		LiveViaLocalFunction,
		'#llf-go',
		'.llf-row',
		['r1:', 'r2:'],
	],
	['a reassigned module function', LiveViaReassignedHelper, '#lrh-go', '.lrh-row', ['r1:', 'r2:']],
];

describe('autoMemo — live accessor results are never frozen by a region cache', () => {
	for (const [label, Component, button, row, [p1, p2]] of liveCases) {
		it(`re-reads through ${label}`, () => {
			const r = mount(Component);
			expect(r.findAll(row).map((li) => li.textContent)).toEqual([`${p1}v0`, `${p2}v0`]);

			// Mutate state that neither the list identity nor any item object
			// witnesses, then force an unrelated parent re-render.
			setLive('v1');
			r.click(button);
			expect(r.findAll(row).map((li) => li.textContent)).toEqual([`${p1}v1`, `${p2}v1`]);

			setLive('v2');
			r.click(button);
			expect(r.findAll(row).map((li) => li.textContent)).toEqual([`${p1}v2`, `${p2}v2`]);
			r.unmount();
		});
	}

	it('re-reads when the live accessor runs in an argument to an admitted projection', () => {
		// `projectCount(row.read().length)` — the callee is a value projection but
		// the ARGUMENT executes the accessor, so the region must not be cached.
		const r = mount(LiveViaProjectedArgument);
		expect(r.findAll('.lpa-row').map((li) => li.textContent)).toEqual(['n5', 'n5']);

		setLive('longer-value');
		r.click('#lpa-go');
		const after = r.findAll('.lpa-row').map((li) => li.textContent);
		expect(after).toEqual(['n15', 'n15']);
		r.unmount();
	});
});

// The converse: regions that ARE memoized through a call must stay reactive to
// the inputs they actually depend on.
const projectionCases: Array<[string, any, string, string, string]> = [
	['a same-module helper', ProjectionModuleHelper, '#pmh-go', '#pmh-bump', '.pmh-row'],
	[
		'a same-module helper reached through another helper',
		ProjectionTransitive,
		'#pt-go',
		'#pt-bump',
		'.pt-row',
	],
	['an imported helper', ProjectionImported, '#pi-go', '#pi-bump', '.pi-row'],
];

describe('autoMemo — memoized projections stay reactive to their real inputs', () => {
	for (const [label, Component, go, bump, row] of projectionCases) {
		it(`updates a changed item rendered through ${label}`, () => {
			const r = mount(Component);
			const initial = r.findAll(row).map((li) => li.textContent);
			expect(initial).toHaveLength(2);
			expect(initial[0]).toMatch(/1:0$/);
			expect(initial[1]).toMatch(/2:0$/);

			// An unrelated parent re-render must not change the rendered text.
			r.click(go);
			expect(r.findAll(row).map((li) => li.textContent)).toEqual(initial);

			// A real item change must reach the DOM, twice in a row.
			r.click(bump);
			expect(r.findAll(row).map((li) => li.textContent)[0]).toMatch(/1:1$/);
			r.click(bump);
			const bumped = r.findAll(row).map((li) => li.textContent);
			expect(bumped[0]).toMatch(/1:2$/);
			// The untouched sibling keeps its original value.
			expect(bumped[1]).toBe(initial[1]);
			r.unmount();
		});
	}
});

describe('autoMemo — hook-shaped callees are not value projections', () => {
	it('a custom hook called inside a region keeps driving the DOM', () => {
		const r = mount(HookInRegion);
		expect(r.findAll('.hir-row').map((li) => li.textContent)).toEqual(['1a', '2a']);

		// Each row owns a hook cell; a region that skipped the call for any row
		// would strand that row's state.
		bumpLabels();
		r.click('#hir-go');
		expect(r.findAll('.hir-row').map((li) => li.textContent)).toEqual(['1b', '2b']);
		r.unmount();
	});

	it('a context consumer under a memoizable region still sees Provider updates', () => {
		// The consumer is an ordinary module `function` declaration. Classifying it
		// as an immutable module helper instead of by its own component
		// eligibility would let the region skip and strand every consumer.
		const r = mount(CtxUnderRegion);
		expect(r.findAll('.ctx-leaf').map((el) => el.textContent)).toEqual(['c0', 'c0']);

		r.click('#cur-bump');
		expect(r.findAll('.ctx-leaf').map((el) => el.textContent)).toEqual(['c1', 'c1']);
		r.unmount();
	});
});

describe('autoMemo — module helpers as call-site witnesses', () => {
	it('a child rendered by a helper-formatting parent tracks its own props', () => {
		// Accepting immutable module `function` helpers as witnesses unblocks the
		// component call-site cache in this parent. The child must still see every
		// real prop change, and must not change when only unrelated state moves.
		const r = mount(CallSiteParent);
		expect(r.find('.csc-child').textContent).toBe('L0');
		expect(r.find('.csc-heading').textContent).toBe('L0');

		// Unrelated state: the heading moves, the child's prop does not.
		r.click('#csp-tick');
		expect(r.find('.csc-heading').textContent).toBe('L1');
		expect(r.find('.csc-child').textContent).toBe('L0');

		// The child's own prop changes and must reach the DOM, repeatedly.
		r.click('#csp-count');
		expect(r.find('.csc-child').textContent).toBe('L1');
		r.click('#csp-count');
		expect(r.find('.csc-child').textContent).toBe('L2');
		expect(r.find('.csc-heading').textContent).toBe('L1');
		r.unmount();
	});
});
