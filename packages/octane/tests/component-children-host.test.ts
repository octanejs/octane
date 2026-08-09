import { describe, it, expect } from 'vitest';
import { mount, type MountResult } from './_helpers';
import {
	WideTrio,
	WidePanels,
	TrailingPanel,
	ChainTrio,
	TransitiveTrio,
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
