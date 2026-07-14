/**
 * Coverage for TSRX features that were previously implicit / untested.
 *
 * Split into two parts:
 *   1. P1 fixes — features we just added (spread attrs, ternary→ifBlock,
 *      .map() compile-error guidance).
 *   2. P2 tests — features that worked but had no coverage (boolean attrs,
 *      dynamic numeric attrs, shorthand attrs, namespaced attrs, for-of
 *      index variants, {html} only-child).
 */
import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import {
	SpreadOnElement,
	SpreadWithExplicit,
	SpreadOnComponent,
	BooleanAttr,
	DynamicNumericAttr,
	ShorthandAttr,
	NamespacedAttr,
	ForOfIndexOnly,
	ForOfIndexAndKey,
	TernaryFragmentChild,
	HtmlOnlyChild,
	KeyedFragmentItems,
	LazyObjectDestructure,
	LazyArrayDestructure,
	LazyParamDestructure,
	LazyForOfHead,
	ShorthandComponentProp,
} from './_fixtures/tsrx-features.tsrx';

// ---------------------------------------------------------------------------
// P1: spread attributes — `{...obj}` on DOM elements and components
// ---------------------------------------------------------------------------

describe('TSRX features — spread attributes on DOM elements', () => {
	it('routes each key through the right setter (class / event / attr)', () => {
		const clicks: string[] = [];
		const r = mount(SpreadOnElement, {
			attrs: {
				class: 'spread-class',
				title: 'hello',
				onClick: () => clicks.push('A'),
			},
		});
		const div = r.find('#target');
		expect(div.className).toBe('spread-class');
		expect(div.getAttribute('title')).toBe('hello');
		r.click('#target');
		expect(clicks).toEqual(['A']);
		r.unmount();
	});

	it('diffs spread objects across updates — vanished keys are cleared', () => {
		const r = mount(SpreadOnElement, {
			attrs: { class: 'one', title: 'first', 'data-id': '42' },
		});
		const div = r.find('#target');
		expect(div.className).toBe('one');
		expect(div.getAttribute('data-id')).toBe('42');

		// Update with a NEW object that drops `data-id` and changes `class`.
		r.update(SpreadOnElement, {
			attrs: { class: 'two', title: 'first' },
		});
		expect(div.className).toBe('two');
		expect(div.hasAttribute('data-id')).toBe(false); // cleared
		expect(div.getAttribute('title')).toBe('first'); // unchanged
		r.unmount();
	});

	it('explicit attr after spread overrides the spread value', () => {
		const r = mount(SpreadWithExplicit, { attrs: { class: 'from-spread' } });
		expect(r.find('div').className).toBe('explicit-wins');
		r.unmount();
	});

	it('handles style + class + custom attrs inside spread', () => {
		const r = mount(SpreadOnElement, {
			attrs: {
				class: 'foo',
				style: { color: 'rgb(10, 20, 30)' },
				'data-test': 'bar',
				title: 'tip',
			},
		});
		const div = r.find('#target') as HTMLElement;
		expect(div.className).toBe('foo');
		expect(div.style.color).toBe('rgb(10, 20, 30)');
		expect(div.getAttribute('data-test')).toBe('bar');
		r.unmount();
	});
});

describe('TSRX features — spread on components', () => {
	it('merges spread into the props object', () => {
		const r = mount(SpreadOnComponent, {
			child: { label: 'A', cls: 'comp-spread', tag: '!' },
		});
		const span = r.find('#child');
		expect(span.className).toBe('comp-spread');
		expect(span.textContent).toBe('A!');

		r.update(SpreadOnComponent, {
			child: { label: 'B', cls: 'updated', tag: '?' },
		});
		expect(span.className).toBe('updated');
		expect(span.textContent).toBe('B?');
		r.unmount();
	});
});

// ---------------------------------------------------------------------------
// P1: ternary → ifBlock lowering (the ONLY ternary-JSX form TSRX accepts is
// fragment branches; we lower to ifBlock for real DOM mount/unmount).
// ---------------------------------------------------------------------------

describe('TSRX features — ternary with fragment branches', () => {
	it('lowers `{cond ? <>...</> : <>...</>}` to ifBlock (real DOM, not stringified)', () => {
		const r = mount(TernaryFragmentChild, { cond: true });
		expect(r.findAll('.yes')).toHaveLength(1);
		expect(r.find('.yes').textContent).toBe('yes');
		expect(r.findAll('.no')).toHaveLength(0);

		r.update(TernaryFragmentChild, { cond: false });
		expect(r.findAll('.yes')).toHaveLength(0);
		expect(r.find('.no').textContent).toBe('no');

		r.update(TernaryFragmentChild, { cond: true });
		expect(r.find('.yes').textContent).toBe('yes');
		r.unmount();
	});
});

// ---------------------------------------------------------------------------
// P2: boolean attrs
// ---------------------------------------------------------------------------

describe('TSRX features — boolean attributes', () => {
	it('emits boolean attr as a present attribute (no value)', () => {
		const r = mount(BooleanAttr);
		const input = r.find('#bool') as HTMLInputElement;
		expect(input.hasAttribute('disabled')).toBe(true);
		expect(input.disabled).toBe(true);
		r.unmount();
	});
});

// ---------------------------------------------------------------------------
// P2: dynamic numeric attrs
// ---------------------------------------------------------------------------

describe('TSRX features — dynamic numeric attribute', () => {
	it('stringifies numeric values via setAttribute', () => {
		const r = mount(DynamicNumericAttr, { n: 12 });
		const input = r.find('#num') as HTMLInputElement;
		expect(input.getAttribute('maxLength')).toBe('12');
		r.update(DynamicNumericAttr, { n: 5 });
		expect(input.getAttribute('maxLength')).toBe('5');
		r.unmount();
	});
});

// ---------------------------------------------------------------------------
// P2: shorthand attribute `<div {value}/>`
// ---------------------------------------------------------------------------

describe('TSRX features — shorthand attribute', () => {
	it('binds the local of the same name to the attribute', () => {
		const r = mount(ShorthandAttr, { id: 'shortcut' });
		expect(r.find('div').getAttribute('id')).toBe('shortcut');
		r.unmount();
	});
});

// ---------------------------------------------------------------------------
// P2: namespaced attribute `xlink:href`
// ---------------------------------------------------------------------------

describe('TSRX features — namespaced attribute', () => {
	it('routes `xlink:href` through setAttributeNS so the attribute carries XLINK_NS', () => {
		// Matches React's parity: a dynamic `xlink:href={…}` results in the same
		// DOM shape as a statically-parsed `<use xlink:href="…"/>` from an SVG
		// template — `attribute.namespaceURI === XLINK_NS`.
		const XLINK_NS = 'http://www.w3.org/1999/xlink';
		const r = mount(NamespacedAttr, { href: '#sprite' });
		const use = r.find('#use-el');
		expect(use.getAttribute('xlink:href')).toBe('#sprite');
		expect(use.getAttributeNode('xlink:href')!.namespaceURI).toBe(XLINK_NS);
		r.unmount();
	});
});

// ---------------------------------------------------------------------------
// P2: for-of header variants
// ---------------------------------------------------------------------------

describe('TSRX features — for-of with `index` only', () => {
	it('binds the per-item index identifier', () => {
		const r = mount(ForOfIndexOnly, { items: ['a', 'b', 'c'] });
		const lis = r.findAll('li');
		expect(lis.map((li) => li.textContent)).toEqual(['0:a', '1:b', '2:c']);
		expect(lis.map((li) => li.className)).toEqual(['i-0', 'i-1', 'i-2']);
		r.unmount();
	});
});

describe('TSRX features — for-of with `index` AND `key`', () => {
	it('uses key for reconciliation and exposes index in body', () => {
		const r = mount(ForOfIndexAndKey, {
			items: [
				{ id: 1, label: 'a' },
				{ id: 2, label: 'b' },
				{ id: 3, label: 'c' },
			],
		});
		expect(r.findAll('li').map((li) => li.textContent)).toEqual(['0:a', '1:b', '2:c']);
		expect(r.findAll('li').map((li) => li.className)).toEqual(['k-1', 'k-2', 'k-3']);

		// Reorder — keys stay, index updates.
		r.update(ForOfIndexAndKey, {
			items: [
				{ id: 3, label: 'c' },
				{ id: 1, label: 'a' },
				{ id: 2, label: 'b' },
			],
		});
		expect(r.findAll('li').map((li) => li.textContent)).toEqual(['0:c', '1:a', '2:b']);
		expect(r.findAll('li').map((li) => li.className)).toEqual(['k-3', 'k-1', 'k-2']);
		r.unmount();
	});

	it('re-renders the index on a SAME-ref reorder (index binding is conservative)', () => {
		// The index-independent reorder skip must NOT apply when the header binds
		// an `index` — otherwise a pure reorder of the SAME item objects would
		// leave stale index text. Reversing identical refs must still update i.
		const a = { id: 1, label: 'a' };
		const b = { id: 2, label: 'b' };
		const c = { id: 3, label: 'c' };
		const r = mount(ForOfIndexAndKey, { items: [a, b, c] });
		expect(r.findAll('li').map((li) => li.textContent)).toEqual(['0:a', '1:b', '2:c']);

		r.update(ForOfIndexAndKey, { items: [c, b, a] }); // same refs, reversed
		expect(r.findAll('li').map((li) => li.textContent)).toEqual(['0:c', '1:b', '2:a']);
		r.unmount();
	});
});

// ---------------------------------------------------------------------------
// P2: {html ...} only-child — confirms innerHTML actually injected
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fragments as keyed items in for-of
// ---------------------------------------------------------------------------

describe('TSRX features — keyed fragment items in for-of', () => {
	it('keeps each fragment together when items reorder (multi-root per iteration)', () => {
		const r = mount(KeyedFragmentItems, {
			items: [
				{ id: 1, label: 'one' },
				{ id: 2, label: 'two' },
				{ id: 3, label: 'three' },
			],
		});
		const initialNodes = r.findAll('li');
		const [oneA, oneB, twoA, twoB, threeA, threeB] = initialNodes;
		expect(initialNodes.map((li) => li.textContent)).toEqual([
			'one-a',
			'one-b',
			'two-a',
			'two-b',
			'three-a',
			'three-b',
		]);

		// Reorder by key — each fragment's TWO `<li>`s travel as a unit.
		r.update(KeyedFragmentItems, {
			items: [
				{ id: 3, label: 'three' },
				{ id: 1, label: 'one' },
				{ id: 2, label: 'two' },
			],
		});
		const reorderedNodes = r.findAll('li');
		expect(reorderedNodes).toEqual([threeA, threeB, oneA, oneB, twoA, twoB]);
		expect(reorderedNodes.map((li) => li.textContent)).toEqual([
			'three-a',
			'three-b',
			'one-a',
			'one-b',
			'two-a',
			'two-b',
		]);

		r.update(KeyedFragmentItems, {
			items: [
				{ id: 1, label: 'ONE' }, // dropped 3, renamed 1
				{ id: 2, label: 'two' },
			],
		});
		const remainingNodes = r.findAll('li');
		expect(remainingNodes).toEqual([oneA, oneB, twoA, twoB]);
		expect(remainingNodes.map((li) => li.textContent)).toEqual([
			'ONE-a',
			'ONE-b',
			'two-a',
			'two-b',
		]);
		r.unmount();
	});
});

// ---------------------------------------------------------------------------
// Lazy destructuring — TSRX `&{ }` and `&[ ]`
// ---------------------------------------------------------------------------

describe('TSRX features — lazy destructuring (accepted as syntax)', () => {
	it('accepts &{ } object pattern and binds the props as expected', () => {
		const r = mount(LazyObjectDestructure, {
			user: { first: 'Ada', last: 'Lovelace' },
		});
		expect(r.find('#lazy-obj').textContent).toBe('Ada Lovelace');
		r.update(LazyObjectDestructure, { user: { first: 'Grace', last: 'Hopper' } });
		expect(r.find('#lazy-obj').textContent).toBe('Grace Hopper');
		r.unmount();
	});

	it('accepts &[ ] array pattern with rest element', () => {
		const r = mount(LazyArrayDestructure, { items: ['a', 'b', 'c', 'd'] });
		expect(r.find('#lazy-arr').textContent).toBe('head=a rest=3');
		r.update(LazyArrayDestructure, { items: ['z'] });
		expect(r.find('#lazy-arr').textContent).toBe('head=z rest=0');
		r.unmount();
	});

	it('accepts &{ } as a component parameter (destructures props at the signature)', () => {
		const r = mount(LazyParamDestructure, { greeting: 'Hi', name: 'World' });
		expect(r.find('#lazy-param').textContent).toBe('Hi, World');
		r.update(LazyParamDestructure, { greeting: 'Hola', name: 'Ripple' });
		expect(r.find('#lazy-param').textContent).toBe('Hola, Ripple');
		r.unmount();
	});

	it('accepts &{ } inside a for-of head — key resolves the destructured field', () => {
		const r = mount(LazyForOfHead, {
			items: [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' },
				{ id: 'c', label: 'C' },
			],
		});
		expect(r.findAll('li').map((li) => li.textContent)).toEqual(['A', 'B', 'C']);
		expect(r.findAll('li').map((li) => li.className)).toEqual(['item-a', 'item-b', 'item-c']);

		// Reorder by key — items move by their destructured-field key.
		r.update(LazyForOfHead, {
			items: [
				{ id: 'c', label: 'C' },
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' },
			],
		});
		expect(r.findAll('li').map((li) => li.className)).toEqual(['item-c', 'item-a', 'item-b']);
		r.unmount();
	});
});

// ---------------------------------------------------------------------------
// Shorthand props on components
// ---------------------------------------------------------------------------

describe('TSRX features — shorthand props on components', () => {
	it('`<Foo {value}/>` is equivalent to `<Foo value={value}/>`', () => {
		const r = mount(ShorthandComponentProp);
		expect(r.find('#child').textContent).toBe('count:7');
		r.unmount();
	});
});

describe('TSRX features — dangerouslySetInnerHTML only-child', () => {
	it('sets innerHTML so the markup parses into real DOM', () => {
		const r = mount(HtmlOnlyChild, {
			markup: '<strong class="bold">hi</strong> <em>there</em>',
		});
		const host = r.find('#html-host');
		expect(host.querySelector('strong')?.textContent).toBe('hi');
		expect(host.querySelector('strong')?.className).toBe('bold');
		expect(host.querySelector('em')?.textContent).toBe('there');
		r.unmount();
	});

	it('updates the markup on prop changes', () => {
		const r = mount(HtmlOnlyChild, { markup: '<p>first</p>' });
		expect(r.find('#html-host p').textContent).toBe('first');
		r.update(HtmlOnlyChild, { markup: '<h2>second</h2>' });
		expect(r.find('#html-host h2').textContent).toBe('second');
		expect(r.findAll('#html-host p')).toHaveLength(0);
		r.unmount();
	});
});
