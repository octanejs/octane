import { describe, it, expect } from 'vitest';
import { mount, flushEffects, act, nextPaint } from './_helpers.js';
import {
	Pair,
	Tree,
	KeyedPair,
	TransitionPair,
	WideTrio,
	SuspendingPair,
} from './_fixtures/component-children-host.tsrx';

// A host element whose children are all component slots, each of which renders
// through an @if/@else (host arm or component arm). The contract: children
// render in source order, an arm flip in one child never disturbs a sibling's
// DOM identity or state, component-local state survives its own flip, and
// teardown leaves nothing behind. These hold in every marker regime, so the
// assertions strip comments the same way mixed-child-order.test.ts does.
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
		// over-widened single-root proof corrupts. Both mount WITH content so
		// their positions are established; a component that mounts EMPTY in an
		// all-component host is a separate known dev-mode ordering defect.
		const m = mount(WideTrio, { aBig: true, bBig: true });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><div class="big">A</div><em class="tail">A</em><div class="big">B</div><span class="leaf">C</span></section>',
		);
		const c = m.find('.leaf');
		// B collapses to empty; A and C keep their nodes.
		const aTail = m.find('.tail');
		m.update(WideTrio, { aBig: true, bBig: false });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><div class="big">A</div><em class="tail">A</em><span class="leaf">C</span></section>',
		);
		expect(m.find('.tail')).toBe(aTail);
		expect(m.find('.leaf')).toBe(c);
		// B returns to its slot BETWEEN A's tail and C.
		m.update(WideTrio, { aBig: true, bBig: true });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><div class="big">A</div><em class="tail">A</em><div class="big">B</div><span class="leaf">C</span></section>',
		);
		expect(m.find('.leaf')).toBe(c);
		// A collapses to a single leaf; B stays put.
		m.update(WideTrio, { aBig: false, bBig: true });
		flushEffects();
		expect(stripComments(m.html())).toBe(
			'<section class="host"><span class="leaf">A</span><div class="big">B</div><span class="leaf">C</span></section>',
		);
		// And back to the wide arm.
		m.update(WideTrio, { aBig: true, bBig: true });
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
