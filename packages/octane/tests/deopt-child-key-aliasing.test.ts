import { describe, it, expect } from 'vitest';
import { createElement, Fragment, positionalChildren, useState } from 'octane';
import { mount } from './_helpers';
import { RowsHole } from './_fixtures/deopt-child-keys.tsrx';

// Descriptors handed to a template HOLE reach the de-opt keyed list, which
// derives an internal reconciliation key per child from its wrapper path plus
// either an explicit `key` or its index. Two properties of that derivation are
// load-bearing:
//
//   1. An explicit `key` never aliases an implicit index — `key="0"` and the
//      unkeyed child at index 0 are different slots, and both can appear in the
//      SAME list.
//   2. A user key can never resemble a nested wrapper path, so a keyed child in
//      one wrapper never adopts a child from another.
//
// Assertions are about node identity and live DOM state, never the key
// spelling — the encoding may change as long as these hold.

const text = (nodes: Element[]) => nodes.map((n) => n.textContent);

describe('de-opt child keys — an explicit key never aliases a positional index', () => {
	it('keeps an unkeyed child and a child keyed "0" in separate slots', () => {
		// Both children live in one list: the unkeyed <input> is at index 0 while
		// its sibling carries key="0". If the two derivations collapsed to the same
		// key, one child would adopt the other's node and its typed value with it.
		function App() {
			const [n, setN] = useState(0);
			const rows = [
				createElement('li', null, createElement('input', { 'data-testid': 'plain' })),
				createElement('li', { key: '0' }, createElement('input', { 'data-testid': 'keyed' })),
			];
			return createElement(
				'div',
				null,
				createElement('button', { 'data-testid': 'go', onClick: () => setN(n + 1) }, 'go'),
				createElement(RowsHole, { rows }),
			);
		}

		const r = mount(App);
		const plain = r.find('[data-testid="plain"]') as HTMLInputElement;
		const keyed = r.find('[data-testid="keyed"]') as HTMLInputElement;
		expect(plain).not.toBe(keyed);
		plain.value = 'p';
		keyed.value = 'k';

		r.click('[data-testid="go"]');
		expect(r.find('[data-testid="plain"]')).toBe(plain);
		expect(r.find('[data-testid="keyed"]')).toBe(keyed);
		expect((r.find('[data-testid="plain"]') as HTMLInputElement).value).toBe('p');
		expect((r.find('[data-testid="keyed"]') as HTMLInputElement).value).toBe('k');
		r.unmount();
	});

	it('does not let a newly prepended unkeyed child steal the key="0" node', () => {
		function App() {
			const [grown, setGrown] = useState(false);
			const keyedRow = createElement(
				'li',
				{ key: '0' },
				createElement('input', { 'data-testid': 'keyed' }),
			);
			const rows = grown
				? [createElement('li', null, createElement('input', { 'data-testid': 'plain' })), keyedRow]
				: [keyedRow];
			return createElement(
				'div',
				null,
				createElement('button', { 'data-testid': 'go', onClick: () => setGrown(true) }, 'go'),
				createElement(RowsHole, { rows }),
			);
		}

		const r = mount(App);
		const keyed = r.find('[data-testid="keyed"]') as HTMLInputElement;
		keyed.value = 'survivor';

		r.click('[data-testid="go"]');
		expect(r.findAll('input')).toHaveLength(2);
		// The keyed row is the survivor; the prepended unkeyed row is new.
		expect(r.find('[data-testid="keyed"]')).toBe(keyed);
		expect((r.find('[data-testid="keyed"]') as HTMLInputElement).value).toBe('survivor');
		expect((r.find('[data-testid="plain"]') as HTMLInputElement).value).toBe('');
		r.unmount();
	});

	it('moves the original nodes when explicitly keyed children reorder', () => {
		function App() {
			const [order, setOrder] = useState(['0', '1', '2']);
			const rows = order.map((k) => createElement('li', { key: k, 'data-testid': `li-${k}` }, k));
			return createElement(
				'div',
				null,
				createElement(
					'button',
					{ 'data-testid': 'rev', onClick: () => setOrder((p) => [...p].reverse()) },
					'rev',
				),
				createElement(RowsHole, { rows }),
			);
		}

		const r = mount(App);
		const before = ['0', '1', '2'].map((k) => r.find(`[data-testid="li-${k}"]`));
		r.click('[data-testid="rev"]');
		expect(text(r.findAll('li'))).toEqual(['2', '1', '0']);
		const after = r.findAll('li');
		expect(after[0]).toBe(before[2]);
		expect(after[1]).toBe(before[1]);
		expect(after[2]).toBe(before[0]);
		r.unmount();
	});
});

describe('de-opt child keys — user keys never collide with wrapper paths', () => {
	it('keeps keys that resemble a serialized wrapper path distinct', () => {
		// Deliberately adversarial keys: each resembles some internal encoding. If a
		// user string could act as structure, two children would share a slot.
		const keys = ['[]', '["wrapper",0]', '[[],"index",0]', '[[],"key","0"]', '0', 'k0', 'i0', 'i1'];

		function App() {
			const [rev, setRev] = useState(false);
			const list = rev ? [...keys].reverse() : keys;
			const rows = list.map((k) => createElement('li', { key: k }, k));
			return createElement(
				'div',
				null,
				createElement('button', { 'data-testid': 'rev', onClick: () => setRev((v) => !v) }, 'rev'),
				createElement(RowsHole, { rows }),
			);
		}

		const r = mount(App);
		expect(text(r.findAll('li'))).toEqual(keys);
		const before = r.findAll('li');

		r.click('[data-testid="rev"]');
		expect(text(r.findAll('li'))).toEqual([...keys].reverse());
		const after = r.findAll('li');
		// Every child survived with its own node — none collapsed into another.
		expect(new Set(after).size).toBe(keys.length);
		for (let i = 0; i < keys.length; i++) expect(after[i]).toBe(before[keys.length - 1 - i]);
		r.unmount();
	});

	it('addresses equally keyed children under different wrappers separately', () => {
		// Two sibling positions each hold an array containing a child keyed "a".
		// The wrapper path is what keeps them apart.
		function App() {
			const [n, setN] = useState(0);
			const rows = positionalChildren([
				[createElement('li', { key: 'a' }, createElement('input', { 'data-testid': 'first' }))],
				[createElement('li', { key: 'a' }, createElement('input', { 'data-testid': 'second' }))],
			]);
			return createElement(
				'div',
				null,
				createElement('button', { 'data-testid': 'go', onClick: () => setN(n + 1) }, 'go'),
				createElement(RowsHole, { rows }),
			);
		}

		const r = mount(App);
		const first = r.find('[data-testid="first"]') as HTMLInputElement;
		const second = r.find('[data-testid="second"]') as HTMLInputElement;
		expect(first).not.toBe(second);
		first.value = 'one';
		second.value = 'two';

		r.click('[data-testid="go"]');
		expect(r.find('[data-testid="first"]')).toBe(first);
		expect(r.find('[data-testid="second"]')).toBe(second);
		expect((r.find('[data-testid="first"]') as HTMLInputElement).value).toBe('one');
		expect((r.find('[data-testid="second"]') as HTMLInputElement).value).toBe('two');
		r.unmount();
	});
});

describe('de-opt child keys — wrapper boundaries survive the top-level fast path', () => {
	it('carries a keyed fragment’s children through a reorder', () => {
		function App() {
			const [rev, setRev] = useState(false);
			const groups = rev ? ['g2', 'g1'] : ['g1', 'g2'];
			const rows = groups.map((g) =>
				createElement(
					Fragment,
					{ key: g },
					createElement('li', { key: 'a', 'data-testid': `${g}-a` }, `${g}a`),
					createElement('li', { key: 'b', 'data-testid': `${g}-b` }, `${g}b`),
				),
			);
			return createElement(
				'div',
				null,
				createElement('button', { 'data-testid': 'rev', onClick: () => setRev((v) => !v) }, 'rev'),
				createElement(RowsHole, { rows }),
			);
		}

		const r = mount(App);
		expect(text(r.findAll('li'))).toEqual(['g1a', 'g1b', 'g2a', 'g2b']);
		const g1a = r.find('[data-testid="g1-a"]');
		const g2b = r.find('[data-testid="g2-b"]');

		r.click('[data-testid="rev"]');
		expect(text(r.findAll('li'))).toEqual(['g2a', 'g2b', 'g1a', 'g1b']);
		expect(r.find('[data-testid="g1-a"]')).toBe(g1a);
		expect(r.find('[data-testid="g2-b"]')).toBe(g2b);
		r.unmount();
	});

	it('keeps an UNKEYED nested wrapper positional', () => {
		// The converse contract, and the reason the wrapper path is part of the key
		// at all: without a key on the wrapper, position addresses the group. This
		// guards against a future key change silently promoting positional wrappers
		// into keyed ones.
		function App() {
			const [rev, setRev] = useState(false);
			const groups = rev ? ['g2', 'g1'] : ['g1', 'g2'];
			const rows = groups.map((g) => [
				createElement('li', { key: `${g}-a`, 'data-testid': `${g}-a` }, `${g}a`),
				createElement('li', { key: `${g}-b`, 'data-testid': `${g}-b` }, `${g}b`),
			]);
			return createElement(
				'div',
				null,
				createElement('button', { 'data-testid': 'rev', onClick: () => setRev((v) => !v) }, 'rev'),
				createElement(RowsHole, { rows }),
			);
		}

		const r = mount(App);
		const g1a = r.find('[data-testid="g1-a"]');
		r.click('[data-testid="rev"]');
		expect(text(r.findAll('li'))).toEqual(['g2a', 'g2b', 'g1a', 'g1b']);
		expect(r.find('[data-testid="g1-a"]')).not.toBe(g1a);
		r.unmount();
	});

	it('preserves a mixed keyed/unkeyed list across an unrelated re-render', () => {
		function App() {
			const [n, setN] = useState(0);
			const rows = positionalChildren([
				createElement('li', { 'data-testid': 'plain' }, 'plain'),
				createElement('li', { key: 'kept', 'data-testid': 'kept' }, 'kept'),
				createElement('li', { 'data-testid': 'tail' }, 'tail'),
			]);
			return createElement(
				'div',
				null,
				createElement('button', { 'data-testid': 'go', onClick: () => setN(n + 1) }, 'go'),
				createElement(RowsHole, { rows }),
			);
		}

		const r = mount(App);
		const nodes = ['plain', 'kept', 'tail'].map((t) => r.find(`[data-testid="${t}"]`));
		r.click('[data-testid="go"]');
		expect(text(r.findAll('li'))).toEqual(['plain', 'kept', 'tail']);
		const after = r.findAll('li');
		for (let i = 0; i < nodes.length; i++) expect(after[i]).toBe(nodes[i]);
		r.unmount();
	});
});
