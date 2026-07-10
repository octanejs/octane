import { describe, it, expect } from 'vitest';
import { createElement, useState } from 'octane';
import { mount } from './_helpers';

// Pure-host → component-bearing upgrade ADOPTS the existing host tree.
//
// A value-position host tree (createElement — the shape every compiled `.tsx`
// component body produces) with NO component descendants renders through the
// RAW pure-host de-opt path (no Blocks). When a conditional child later flips
// to a COMPONENT descriptor (`on && createElement(Inner)`), descNeedsBlocks()
// reclassifies the tree through hostElementBody — and the upgrade must ADOPT
// the existing element + its raw children into the blocks representation
// (childSlot's upgrade branch + the ForSlot adopt queue) rather than rebuild:
// React preserves sibling host node identity (only the flipped position
// mounts). Surfaced by the react-hook-form port (packages/hook-form):
// upstream tests capture sibling elements before interactions that mount a
// <Controller/>. The .tsrx template path was never affected (conditionals are
// marker-delimited holes there) — this is de-opt-only.
function Inner() {
	return createElement('input', { 'data-testid': 'inner' });
}

function Comp() {
	const [on, setOn] = useState(false);
	return createElement(
		'form',
		null,
		createElement('p', { 'data-testid': 'p' }, String(on)),
		createElement('button', { 'data-testid': 'btn', onClick: () => setOn(true) }, 'flip'),
		on && createElement(Inner, null),
	);
}

function Keyed() {
	const [items, setItems] = useState(['a', 'b']);
	const [on, setOn] = useState(false);
	return createElement(
		'ul',
		null,
		createElement(
			'button',
			{ 'data-testid': 'grow', onClick: () => (setItems(['a', 'b', 'c']), setOn(true)) },
			'grow',
		),
		items.map((v) => createElement('li', { key: v, 'data-testid': `li-${v}` }, v)),
		on && createElement(Inner, null),
	);
}

function NestedFlip() {
	const [on, setOn] = useState(false);
	return createElement(
		'section',
		null,
		createElement('button', { 'data-testid': 'btn', onClick: () => setOn(true) }, 'flip'),
		createElement(
			'div',
			{ 'data-testid': 'wrap' },
			createElement('input', { 'data-testid': 'keep' }),
			on && createElement(Inner, null),
		),
	);
}

describe('de-opt pure-host → component upgrade', () => {
	it('preserves sibling host node identity across the upgrade', () => {
		const r = mount(Comp);
		const p = r.find('[data-testid="p"]');
		const form = r.find('form');
		const btn = r.find('[data-testid="btn"]');
		r.click('[data-testid="btn"]');
		expect(r.find('[data-testid="inner"]')).toBeTruthy();
		// React parity: the untouched siblings keep their physical nodes.
		expect(r.find('form')).toBe(form);
		expect(r.find('[data-testid="p"]')).toBe(p);
		expect(r.find('[data-testid="btn"]')).toBe(btn);
		expect(r.find('[data-testid="p"]').textContent).toBe('true');
		r.unmount();
	});

	it('adopts keyed list items across the upgrade (values + identity survive)', () => {
		const r = mount(Keyed);
		const liA = r.find('[data-testid="li-a"]');
		const liB = r.find('[data-testid="li-b"]');
		r.click('[data-testid="grow"]');
		expect(r.find('[data-testid="inner"]')).toBeTruthy();
		expect(r.find('[data-testid="li-a"]')).toBe(liA);
		expect(r.find('[data-testid="li-b"]')).toBe(liB);
		expect(r.findAll('li').map((li) => li.textContent)).toEqual(['a', 'b', 'c']);
		r.unmount();
	});

	it('adopts recursively when the flip is nested deeper in the tree', () => {
		const r = mount(NestedFlip);
		const wrap = r.find('[data-testid="wrap"]');
		const keep = r.find('[data-testid="keep"]') as HTMLInputElement;
		keep.value = 'typed';
		r.click('[data-testid="btn"]');
		expect(r.find('[data-testid="inner"]')).toBeTruthy();
		expect(r.find('[data-testid="wrap"]')).toBe(wrap);
		expect(r.find('[data-testid="keep"]')).toBe(keep);
		expect((r.find('[data-testid="keep"]') as HTMLInputElement).value).toBe('typed');
		r.unmount();
	});

	it('tears the upgraded tree down cleanly (flip off again)', () => {
		const r = mount(Comp);
		r.click('[data-testid="btn"]');
		expect(r.find('[data-testid="inner"]')).toBeTruthy();
		r.unmount();
		expect(document.querySelector('[data-testid="inner"]')).toBeNull();
	});
});
