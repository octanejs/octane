import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from './_helpers';
import { flushSync } from '../src/index.js';
import { ActivityHost, NestedActivity, TextActivityHost } from './_fixtures/activity.tsrx';

// Parity with React 19 <Activity mode="hidden"|"visible"> — the portable subset
// of React's Activity-test.js / ReactDOMActivity-test.js (DOM + effect lifecycle
// + state preservation; scheduler/lane/StrictMode-internal tests are excluded).

function setup(initialMode: string) {
	const log: string[] = [];
	let setN: ((u: (v: number) => number) => void) | null = null;
	const opts = {
		mode: initialMode,
		log: (s: string) => log.push(s),
		expose: (fn: any) => (setN = fn),
	};
	const r = mount(ActivityHost, opts);
	flushEffects();
	const child = () => r.container.querySelector('#child') as HTMLElement | null;
	return {
		r,
		log,
		setMode: (m: string) => {
			r.update(ActivityHost, { ...opts, mode: m });
			flushEffects();
		},
		bump: () => {
			flushSync(() => setN!((v) => v + 1));
			flushEffects();
		},
		text: () => child()?.textContent ?? null,
		display: () => child()?.style.display ?? null,
		present: () => child() != null,
	};
}

describe('<Activity> — visible', () => {
	it('mount visible renders children and mounts effects', () => {
		const t = setup('visible');
		expect(t.log).toEqual(['render', 'mount layout', 'mount passive']);
		expect(t.text()).toBe('0');
		expect(t.display()).toBe('');
		t.r.unmount();
	});
});

describe('<Activity> — hidden', () => {
	it('mount hidden renders children + creates state but mounts NO effects, and hides the DOM', () => {
		const t = setup('hidden');
		expect(t.log).toEqual(['render']); // rendered, but no effects
		expect(t.present()).toBe(true); // DOM preserved...
		expect(t.text()).toBe('0'); // ...and rendered
		expect(t.display()).toBe('none'); // ...just visually hidden
		t.r.unmount();
	});
});

describe('<Activity> — toggling visibility', () => {
	it('unmounts effects on hide and re-mounts them on show, preserving state + DOM', () => {
		const t = setup('visible');
		// Build up some state while visible.
		t.bump();
		t.bump();
		expect(t.text()).toBe('2');
		t.log.length = 0;

		// Hide: effect cleanups run (before the DOM is hidden); state + DOM kept.
		t.setMode('hidden');
		expect(t.log).toEqual(['render', 'unmount layout', 'unmount passive']);
		expect(t.display()).toBe('none');
		expect(t.text()).toBe('2'); // state preserved while hidden
		t.log.length = 0;

		// Show: re-render + effects re-mount; state survived the round-trip.
		t.setMode('visible');
		expect(t.log).toEqual(['render', 'mount layout', 'mount passive']);
		expect(t.display()).toBe('');
		expect(t.text()).toBe('2');
		t.r.unmount();
	});

	it('starting hidden then shown defers the first effect mount until reveal', () => {
		const t = setup('hidden');
		expect(t.log).toEqual(['render']);
		t.log.length = 0;

		t.setMode('visible');
		expect(t.log).toEqual(['render', 'mount layout', 'mount passive']);
		expect(t.display()).toBe('');
		t.r.unmount();
	});

	it('flushes a passive effect queued before the Activity hid, then disconnects it', () => {
		// React parity: pending passive effects flush BEFORE the next render begins
		// (flushPassiveEffects at the start of performWorkOnRoot/commitRoot). A
		// passive queued by a VISIBLE commit therefore mounts against the
		// still-visible tree even if the very next update hides the Activity — and
		// the hide then disconnects it (cleanup). The body never runs while the
		// subtree is hidden: the drain happens before the hide render, and
		// deactivateScope tears it straight back down.
		const log: string[] = [];
		const opts = { mode: 'visible', log: (s: string) => log.push(s), expose: () => {} };
		const r = mount(ActivityHost, opts);
		// Layout fired synchronously during mount; passive is queued, not yet run.
		expect(log).toEqual(['render', 'mount layout']);

		// Hide BEFORE the passive queue drains. The queued passive mounts (visible
		// tree) as part of processing the hide, then the hide disconnects both
		// effects. (The extra 'render' is octane's eager hidden prerender.)
		r.update(ActivityHost, { ...opts, mode: 'hidden' });
		flushEffects();
		expect(log).toEqual([
			'render',
			'mount layout',
			'mount passive',
			'render',
			'unmount layout',
			'unmount passive',
		]);

		// On reveal the effects re-mount — the hide/flush interleaving above must
		// not leave the slot wedged.
		log.length = 0;
		r.update(ActivityHost, { ...opts, mode: 'visible' });
		flushEffects();
		expect(log).toEqual(['render', 'mount layout', 'mount passive']);
		r.unmount();
	});

	it('re-renders while hidden (updates DOM) without running effects', () => {
		const t = setup('hidden');
		t.log.length = 0;
		// Bump state while hidden — DOM must update (prerender) but no effects.
		t.bump();
		expect(t.text()).toBe('1'); // DOM updated while hidden
		expect(t.display()).toBe('none');
		expect(t.log).toEqual(['render']); // re-rendered, still no effects
		t.r.unmount();
	});
});

describe('<Activity> — nested', () => {
	it('an inner visible Activity inside a hidden outer mounts nothing until the outer reveals', () => {
		const log: string[] = [];
		const opts = { outer: 'hidden', inner: 'visible', log: (s: string) => log.push(s) };
		const r = mount(NestedActivity, opts);
		flushEffects();
		// Outer hidden → inner renders but no effects, even though inner is visible.
		expect(log).toEqual(['render inner']);
		expect((r.container.querySelector('#inner') as HTMLElement).style.display).toBe('none');
		log.length = 0;

		// Reveal the outer → inner effects finally mount.
		r.update(NestedActivity, { ...opts, outer: 'visible' });
		flushEffects();
		expect(log).toEqual(['render inner', 'mount inner']);
		expect((r.container.querySelector('#inner') as HTMLElement).style.display).toBe('');
		r.unmount();
	});
});

describe('<Activity> — bare text child', () => {
	// A direct text node has no box and can't take display:none. Hiding must blank
	// its data instead, or the text stays visible while the subtree is "hidden".
	const host = (r: any) => r.container.querySelector('#host') as HTMLElement;

	it('mount hidden hides bare text (data blanked); not visible in the DOM', () => {
		const r = mount(TextActivityHost, { mode: 'hidden', text: 'secret' });
		flushEffects();
		expect(host(r).textContent).toBe(''); // text node blanked
		r.unmount();
	});

	it('mount visible shows the text', () => {
		const r = mount(TextActivityHost, { mode: 'visible', text: 'secret' });
		flushEffects();
		expect(host(r).textContent).toBe('secret');
		r.unmount();
	});

	it('toggling restores the text on show and re-hides on hide', () => {
		const r = mount(TextActivityHost, { mode: 'visible', text: 'secret' });
		flushEffects();
		expect(host(r).textContent).toBe('secret');

		r.update(TextActivityHost, { mode: 'hidden', text: 'secret' });
		expect(host(r).textContent).toBe('');

		r.update(TextActivityHost, { mode: 'visible', text: 'secret' });
		expect(host(r).textContent).toBe('secret');
		r.unmount();
	});
});

import { NestedRevealActivity } from './_fixtures/activity.tsrx';

describe('<Activity> — nested reveal (conformance)', () => {
	// Per Activity-test.js:1362 "reveal an outer Activity boundary without revealing an
	// inner one". Both hidden → reveal the outer while the inner stays hidden → only the
	// outer subtree's effects mount; the still-hidden inner's do not.
	it('revealing the outer Activity does not mount a still-hidden inner one', () => {
		const log: string[] = [];
		const opts = { outer: 'hidden', inner: 'hidden', log: (s: string) => log.push(s) };
		const r = mount(NestedRevealActivity, opts);
		flushEffects();
		expect(log).toEqual([]); // both hidden → no effects mounted

		// Reveal outer; inner stays hidden.
		r.update(NestedRevealActivity, { ...opts, outer: 'visible' });
		flushEffects();
		expect(log).toEqual(['Mount Outer']); // ONLY the outer; inner is still hidden

		// Now reveal the inner too.
		r.update(NestedRevealActivity, { outer: 'visible', inner: 'visible', log: opts.log });
		flushEffects();
		expect(log).toEqual(['Mount Outer', 'Mount Inner']);
		r.unmount();
	});
});

import { OrderActivity } from './_fixtures/activity.tsrx';

describe('<Activity> — effect cleanup order on hide (conformance)', () => {
	// Per Activity-test.js "passive effects are unmounted on hide in the same order as
	// during a deletion: parent before child" (and child-first on mount/reveal).
	it('mounts child-first and tears down parent-first on hide', () => {
		const log: string[] = [];
		const opts = { mode: 'visible', log: (s: string) => log.push(s) };
		const r = mount(OrderActivity, opts);
		flushEffects();
		expect(log).toEqual(['mount child', 'mount parent']); // child-first on mount
		log.length = 0;

		r.update(OrderActivity, { ...opts, mode: 'hidden' });
		flushEffects();
		expect(log).toEqual(['unmount parent', 'unmount child']); // parent-first on hide
		r.unmount();
	});
});
