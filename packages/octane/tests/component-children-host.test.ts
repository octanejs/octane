import { describe, it, expect } from 'vitest';
import { mount, flushEffects, act, nextPaint, type MountResult } from './_helpers';
import {
	WideTrio,
	WidePanels,
	TrailingPanel,
	ChainTrio,
	TransitiveTrio,
	Pair,
	Tree,
	KeyedPair,
	TransitionPair,
	FragmentTrio,
	SuspendingPair,
} from './_fixtures/component-children-host.tsrx';

// A host element whose children are ALL components mounts each child slot in
// source order. The contract pinned here is sibling ORDER: a component child
// that renders nothing at mount and produces content on a later render must
// still place that content at its own source position — ahead of every later
// sibling's content — and keep doing so across repeated toggles.
//
// Assertions read element order (`children`) and textContent, never raw
// innerHTML: the dev and prod compiles legitimately differ in comment markers.

const order = (r: MountResult) =>
	[...r.find('section.host').children].map((el) => `${el.className}:${el.textContent}`);

describe('all-component-children host sibling order', () => {
	it('children that start with content mount in source order', () => {
		const r = mount(WidePanels, { aBig: true, bBig: true });
		expect(order(r)).toEqual(['big:A', 'big:B', 'leaf:C']);
		r.unmount();
	});

	it('a panel that mounts EMPTY renders before its later sibling once it appears', () => {
		const r = mount(WideTrio, { bBig: false });
		expect(order(r)).toEqual(['leaf:C']);

		r.update(WideTrio, { bBig: true });
		expect(order(r)).toEqual(['big:B', 'leaf:C']);

		// And the order survives toggling away and back.
		r.update(WideTrio, { bBig: false });
		expect(order(r)).toEqual(['leaf:C']);
		r.update(WideTrio, { bBig: true });
		expect(order(r)).toEqual(['big:B', 'leaf:C']);
		r.unmount();
	});

	it('two empty-mounted panels interleave in source order regardless of toggle order', () => {
		// B appears first, then A — A must still land ahead of B.
		const r = mount(WidePanels, { aBig: false, bBig: false });
		expect(order(r)).toEqual(['leaf:C']);

		r.update(WidePanels, { aBig: false, bBig: true });
		expect(order(r)).toEqual(['big:B', 'leaf:C']);

		r.update(WidePanels, { aBig: true, bBig: true });
		expect(order(r)).toEqual(['big:A', 'big:B', 'leaf:C']);

		r.update(WidePanels, { aBig: false, bBig: true });
		expect(order(r)).toEqual(['big:B', 'leaf:C']);

		r.update(WidePanels, { aBig: true, bBig: true });
		expect(order(r)).toEqual(['big:A', 'big:B', 'leaf:C']);
		r.unmount();
	});

	it('a full @if/@else chain child keeps its place across branch swaps', () => {
		const r = mount(ChainTrio, { aBig: false });
		expect(order(r)).toEqual(['small:A', 'leaf:C']);

		r.update(ChainTrio, { aBig: true });
		expect(order(r)).toEqual(['big:A', 'leaf:C']);
		r.update(ChainTrio, { aBig: false });
		expect(order(r)).toEqual(['small:A', 'leaf:C']);
		r.unmount();
	});

	it('an empty mount reached through a chain child still inserts in source order', () => {
		// The may-render-nothing panel sits INSIDE a full-chain arm, so the
		// hazard is only visible transitively through the chain component.
		const r = mount(TransitiveTrio, { bBig: false });
		expect(order(r)).toEqual(['leaf:C']);

		r.update(TransitiveTrio, { bBig: true });
		expect(order(r)).toEqual(['big:B', 'leaf:C']);
		r.update(TransitiveTrio, { bBig: false });
		expect(order(r)).toEqual(['leaf:C']);
		r.update(TransitiveTrio, { bBig: true });
		expect(order(r)).toEqual(['big:B', 'leaf:C']);
		r.unmount();
	});

	it('a trailing panel that mounts empty appears after its earlier sibling', () => {
		const r = mount(TrailingPanel, { zBig: false });
		expect(order(r)).toEqual(['leaf:A']);

		r.update(TrailingPanel, { zBig: true });
		expect(order(r)).toEqual(['leaf:A', 'big:Z']);

		r.update(TrailingPanel, { zBig: false });
		expect(order(r)).toEqual(['leaf:A']);
		r.update(TrailingPanel, { zBig: true });
		expect(order(r)).toEqual(['leaf:A', 'big:Z']);
		r.unmount();
	});
});

// Children whose @if/@else bodies are proven single-root transitively (host or
// component arms) mount with no minted markers. The contract: source order, an
// arm flip in one child never disturbs a sibling's DOM identity or state,
// component-local state survives its own flip, and teardown leaves nothing
// behind. These hold in every marker regime, so the assertions strip comments
// the same way mixed-child-order.test.ts does.
function stripComments(html: string): string {
	return html.replace(/<!--[\s\S]*?-->/g, '');
}

describe('host with only component children (@if-root components)', () => {
	it('mounts both children in source order', () => {
		const m = mount(Pair, { aBig: true, bBig: false });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><div class="big">A:0</div><span class="leaf">B</span></section>',
		);
		m.unmount();
	});

	it('flipping the FIRST child keeps order and the second child’s DOM node', () => {
		const m = mount(Pair, { aBig: true, bBig: true });
		flushEffects();
		const b = m.findAll('.big')[1];
		m.update(Pair, { aBig: false, bBig: true });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><span class="leaf">A</span><div class="big">B:0</div></section>',
		);
		// The sibling was not remounted or moved.
		expect(m.findAll('.big')[0]).toBe(b);
		m.unmount();
	});

	it('flipping the LAST child keeps order and the first child’s DOM node', () => {
		const m = mount(Pair, { aBig: true, bBig: true });
		flushEffects();
		const a = m.findAll('.big')[0];
		m.update(Pair, { aBig: true, bBig: false });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><div class="big">A:0</div><span class="leaf">B</span></section>',
		);
		expect(m.findAll('.big')[0]).toBe(a);
		m.unmount();
	});

	it('component-local state survives its own arm round trip; sibling state untouched', () => {
		const m = mount(Pair, { aBig: true, bBig: true });
		flushEffects();
		// Bump A's counter, then flip A's arm away and back.
		m.click('.big'); // first .big is A
		expect(stripComments(m.html())).toContain('A:1');
		const b = m.findAll('.big')[1];
		m.update(Pair, { aBig: false, bBig: true });
		flushEffects();
		m.update(Pair, { aBig: true, bBig: true });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><div class="big">A:1</div><div class="big">B:0</div></section>',
		);
		expect(m.findAll('.big')[1]).toBe(b);
		// The re-rendered arm's handler is live.
		m.click('.big');
		expect(stripComments(m.html())).toContain('A:2');
		m.unmount();
	});

	it('repeated flips of both children converge to the right DOM', () => {
		const m = mount(Pair, { aBig: true, bBig: false });
		flushEffects();
		for (let i = 0; i < 3; i++) {
			m.update(Pair, { aBig: false, bBig: true });
			flushEffects();
			expect(stripComments(m.html())).toBe(
				'<section class="host"><span class="leaf">A</span><div class="big">B:0</div></section>',
			);
			m.update(Pair, { aBig: true, bBig: false });
			flushEffects();
			expect(stripComments(m.html())).toBe(
				'<section class="host"><div class="big">A:0</div><span class="leaf">B</span></section>',
			);
		}
		m.unmount();
	});

	it('recursive tree mounts every leaf in order and tears down empty', () => {
		const m = mount(Tree, { depth: 3, path: 'r' });
		flushEffects();
		const leaves = m.findAll('.leaf').map((el) => el.textContent);
		expect(leaves).toEqual(['rLLL', 'rLLR', 'rLRL', 'rLRR', 'rRLL', 'rRLR', 'rRRL', 'rRRR']);
		expect(m.findAll('.n').length).toBe(7);
		m.root.unmount();
		expect(m.container.innerHTML).toBe('');
		m.container.remove();
	});

	it('growing the tree flips leaf arms into interior nodes in place', () => {
		const m = mount(Tree, { depth: 1, path: 'r' });
		flushEffects();
		expect(m.findAll('.leaf').map((el) => el.textContent)).toEqual(['rL', 'rR']);
		const root = m.find('.n');
		m.update(Tree, { depth: 2, path: 'r' });
		flushEffects();
		expect(m.findAll('.leaf').map((el) => el.textContent)).toEqual(['rLL', 'rLR', 'rRL', 'rRR']);
		// The root interior node survives; only the child arms flipped.
		expect(m.find('.n')).toBe(root);
		m.update(Tree, { depth: 1, path: 'r' });
		flushEffects();
		expect(m.findAll('.leaf').map((el) => el.textContent)).toEqual(['rL', 'rR']);
		expect(m.find('.n')).toBe(root);
		m.root.unmount();
		expect(m.container.innerHTML).toBe('');
		m.container.remove();
	});

	it('a keyed component child still remounts on key change; unkeyed sibling node survives', () => {
		const m = mount(KeyedPair, { k: 1 });
		flushEffects();
		m.click('.c');
		expect(stripComments(m.html())).toContain('A:1');
		const leaf = m.find('.leaf');
		m.update(KeyedPair, { k: 2 });
		flushEffects();
		// Key change reset the counter state…
		expect(stripComments(m.html())).toContain('A:0');
		// …without touching the sibling.
		expect(m.find('.leaf')).toBe(leaf);
		m.unmount();
	});

	it('children that can render zero or two roots keep order/identity through flips', () => {
		// WidePanel's arm is a fragment (two DOM roots) and MaybePanel has no
		// @else (can render nothing), so neither can self-delimit — the contract
		// must hold however their slots are bounded. This is the shape an
		// over-widened single-root proof corrupts. (The empty-MOUNT ordering
		// cases live in the describe above.)
		const m = mount(FragmentTrio, { aBig: true, bBig: true });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><div class="big">A</div><em class="tail">A</em><div class="big">B</div><span class="leaf">C</span></section>',
		);
		const c = m.find('.leaf');
		// B collapses to empty; A and C keep their nodes.
		const aTail = m.find('.tail');
		m.update(FragmentTrio, { aBig: true, bBig: false });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><div class="big">A</div><em class="tail">A</em><span class="leaf">C</span></section>',
		);
		expect(m.find('.tail')).toBe(aTail);
		expect(m.find('.leaf')).toBe(c);
		// B returns to its slot BETWEEN A's tail and C.
		m.update(FragmentTrio, { aBig: true, bBig: true });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><div class="big">A</div><em class="tail">A</em><div class="big">B</div><span class="leaf">C</span></section>',
		);
		expect(m.find('.leaf')).toBe(c);
		// A collapses to a single leaf; B stays put.
		m.update(FragmentTrio, { aBig: false, bBig: true });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><span class="leaf">A</span><div class="big">B</div><span class="leaf">C</span></section>',
		);
		// And back to the wide arm.
		m.update(FragmentTrio, { aBig: true, bBig: true });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><div class="big">A</div><em class="tail">A</em><div class="big">B</div><span class="leaf">C</span></section>',
		);
		m.root.unmount();
		expect(m.container.innerHTML).toBe('');
		m.container.remove();
	});

	it('a suspending child falls back and resolves into source order beside its sibling', async () => {
		let resolve!: (v: string) => void;
		const p = new Promise<string>((res) => {
			resolve = res;
		});
		const m = mount(SuspendingPair, { p });
		// Suspended before inserting content: the fallback shows and no child
		// content has landed in the (off-screen) host.
		expect(m.findAll('.fb').length).toBe(1);
		expect(m.findAll('.big').length).toBe(0);
		resolve('A');
		await nextPaint();
		await nextPaint();
		expect(m.findAll('.fb').length).toBe(0);
		expect(stripComments(m.find('.host').innerHTML)).toBe(
			'<div class="big">A</div><div class="big">B:0</div>',
		);
		// The resolved sibling is interactive.
		m.click('.host .big:nth-child(2)');
		expect(stripComments(m.find('.host').innerHTML)).toBe(
			'<div class="big">A</div><div class="big">B:1</div>',
		);
		m.root.unmount();
		expect(m.container.innerHTML).toBe('');
		m.container.remove();
	});

	it('a transition-driven arm flip keeps the sibling’s DOM node', async () => {
		const m = mount(TransitionPair);
		flushEffects();
		const b = m.findAll('.big')[1];
		await act(async () => {
			m.click('.flip');
		});
		expect(stripComments(m.find('.host').innerHTML)).toBe(
			'<span class="leaf">A</span><div class="big">B:0</div>',
		);
		expect(m.findAll('.big')[0]).toBe(b);
		await act(async () => {
			m.click('.flip');
		});
		expect(stripComments(m.find('.host').innerHTML)).toBe(
			'<div class="big">A:0</div><div class="big">B:0</div>',
		);
		expect(m.findAll('.big')[1]).toBe(b);
		m.unmount();
	});
});
