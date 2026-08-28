import { describe, it, expect } from 'vitest';
import { Suspense, createElement, lazy, useState } from 'octane';
import { act, mount } from './_helpers';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

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
		createElement('button', { 'data-testid': 'btn', onClick: () => setOn(!on) }, 'flip'),
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

function KeyedWithStaleTail() {
	const [items, setItems] = useState(['a', 'b', 'c']);
	const [on, setOn] = useState(false);
	return createElement(
		'ul',
		null,
		createElement(
			'button',
			{
				'data-testid': 'replace',
				onClick: () => (setItems(['a', 'x', 'c']), setOn(true)),
			},
			'replace',
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

	it('keeps an adopted prefix while removing incompatible stale list nodes', () => {
		const r = mount(KeyedWithStaleTail);
		const liA = r.find('[data-testid="li-a"]');
		const staleB = r.find('[data-testid="li-b"]');
		const staleC = r.find('[data-testid="li-c"]');
		r.click('[data-testid="replace"]');
		expect(r.find('[data-testid="li-a"]')).toBe(liA);
		expect(r.find('[data-testid="li-c"]')).not.toBe(staleC);
		expect(r.findAll('li').map((li) => li.textContent)).toEqual(['a', 'x', 'c']);
		expect(staleB.isConnected).toBe(false);
		expect(staleC.isConnected).toBe(false);
		r.unmount();
	});

	it('re-adopts a retained keyed prefix when a later component suspends', async () => {
		const loaded = deferred<{ default: typeof Inner }>();
		const LazyInner = lazy(() => loaded.promise);

		function SuspendedUpgrade() {
			const [items, setItems] = useState(['a', 'b', 'c']);
			const [on, setOn] = useState(false);
			return createElement(Suspense, {
				fallback: createElement('p', { 'data-testid': 'pending' }, 'pending'),
				children: createElement(
					'ul',
					null,
					createElement(
						'button',
						{
							'data-testid': 'replace-lazily',
							onClick: () => (setItems(['a', 'x', 'c']), setOn(true)),
						},
						'replace lazily',
					),
					items.map((value) =>
						createElement('li', { key: value, 'data-testid': `li-${value}` }, value),
					),
					on && createElement(LazyInner, { key: 'lazy' }),
				),
			});
		}

		const r = mount(SuspendedUpgrade);
		try {
			const retainedA = r.find('[data-testid="li-a"]');
			const staleB = r.find('[data-testid="li-b"]');
			const staleC = r.find('[data-testid="li-c"]');
			r.click('[data-testid="replace-lazily"]');
			expect(r.find('[data-testid="pending"]').textContent).toBe('pending');

			await act(() => loaded.resolve({ default: Inner }));
			expect(r.find('[data-testid="li-a"]')).toBe(retainedA);
			expect(r.findAll('li').map((li) => li.textContent)).toEqual(['a', 'x', 'c']);
			expect(staleB.isConnected).toBe(false);
			expect(staleC.isConnected).toBe(false);
			expect(r.find('[data-testid="inner"]')).toBeTruthy();
		} finally {
			r.unmount();
		}
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

	it('preserves the host and siblings when the last component disappears and returns', () => {
		const r = mount(Comp);
		try {
			const form = r.find('form');
			const paragraph = r.find('[data-testid="p"]');
			const button = r.find('[data-testid="btn"]');
			r.click('[data-testid="btn"]');
			const input = r.find('[data-testid="inner"]') as HTMLInputElement;
			input.value = 'temporary detail';

			r.click('[data-testid="btn"]');
			expect(r.findAll('[data-testid="inner"]')).toEqual([]);
			expect(input.isConnected).toBe(false);
			expect(r.find('form')).toBe(form);
			expect(r.find('[data-testid="p"]')).toBe(paragraph);
			expect(paragraph.textContent).toBe('false');
			expect(r.find('[data-testid="btn"]')).toBe(button);

			r.click('[data-testid="btn"]');
			expect(r.find('form')).toBe(form);
			expect(r.find('[data-testid="p"]')).toBe(paragraph);
			expect(paragraph.textContent).toBe('true');
			expect(r.find('[data-testid="inner"]')).not.toBe(input);
			expect((r.find('[data-testid="inner"]') as HTMLInputElement).value).toBe('');
		} finally {
			r.unmount();
		}
		expect(document.querySelector('[data-testid="inner"]')).toBeNull();
	});
});
