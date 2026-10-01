import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from './_helpers.js';
import {
	FastPathDiv,
	FastPathInput,
	FastPathMulti,
	FastPathSvgEdge,
} from './_fixtures/single-spread-fast-path.tsrx';

// A commit whose spread source re-resolves to the same shape must write only
// the props that actually changed — identical sources and equal-value fresh
// containers write nothing, a changed value writes just its attribute, and a
// key appearing or disappearing adds/removes it. These are pure fast paths
// over the resolved-record diff — never a semantic fork — so the oracles sit
// on the DOM boundary (MutationObserver records, setAttribute/removeAttribute
// call counts). How much work the commits skip is an allocation claim that
// belongs to the benchmark layer, not this suite.

function watchWrites(el: Element): MutationObserver {
	const observer = new MutationObserver(() => {});
	observer.observe(el, {
		attributes: true,
		characterData: true,
		childList: true,
		subtree: true,
	});
	return observer;
}

const EDGE = {
	cls: 'edge',
	d: 'M0 0L1 1',
	style: { stroke: 'red' },
	attrs: { 'data-x': '1', title: 'edge' },
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe('a single spread source beside named props', () => {
	it('writes only changed props across identical, equal-value, and reshaped commits', () => {
		const setAttribute = vi.spyOn(Element.prototype, 'setAttribute');
		const removeAttribute = vi.spyOn(Element.prototype, 'removeAttribute');
		const r = mount(FastPathSvgEdge, { tick: 'a', ...EDGE });
		const target = r.find('#fp-edge');
		expect(target.getAttribute('class')).toBe('edge');
		expect(target.getAttribute('d')).toBe('M0 0L1 1');
		expect(target.getAttribute('data-x')).toBe('1');
		const observer = watchWrites(target);
		setAttribute.mockClear();
		removeAttribute.mockClear();

		// Identical source objects: the commit is real (the tick sibling
		// updates) but the host sees no writes.
		r.update(FastPathSvgEdge, { tick: 'b', ...EDGE });
		expect(r.find('#edge-tick').textContent).toBe('b');
		expect(observer.takeRecords()).toEqual([]);
		expect(setAttribute).not.toHaveBeenCalled();
		expect(removeAttribute).not.toHaveBeenCalled();

		// Fresh containers holding equal values still write nothing.
		r.update(FastPathSvgEdge, {
			tick: 'c',
			cls: 'edge',
			d: 'M0 0L1 1',
			style: { stroke: 'red' },
			attrs: { 'data-x': '1', title: 'edge' },
		});
		expect(observer.takeRecords()).toEqual([]);

		r.update(FastPathSvgEdge, {
			tick: 'd',
			cls: 'edge',
			d: 'M0 0L1 1',
			style: { stroke: 'red' },
			attrs: { 'data-x': '1', title: 'edge' },
		});
		expect(observer.takeRecords()).toEqual([]);

		// A changed spread value reaches the host without disturbing the rest.
		r.update(FastPathSvgEdge, {
			tick: 'e',
			cls: 'edge',
			d: 'M0 0L1 1',
			style: { stroke: 'red' },
			attrs: { 'data-x': '2', title: 'edge' },
		});
		expect(target.getAttribute('data-x')).toBe('2');
		expect(target.getAttribute('title')).toBe('edge');

		// A new key in the source adds its attribute.
		r.update(FastPathSvgEdge, {
			tick: 'f',
			cls: 'edge',
			d: 'M0 0L1 1',
			style: { stroke: 'red' },
			attrs: { 'data-x': '2', title: 'edge', 'data-more': '3' },
		});
		expect(target.getAttribute('data-more')).toBe('3');
		observer.disconnect();
		r.unmount();
	});

	it('detects in-place mutation of the spread source by value, not identity', () => {
		const attrs = { 'data-x': '1', title: 'edge' };
		const r = mount(FastPathDiv, { tick: 'a', cls: 'row', attrs });
		const target = r.find('#fp-div');
		expect(target.getAttribute('data-x')).toBe('1');

		// The SAME source object with a mutated value must still write: the bail
		// compares values against the committed record, never source identity.
		attrs['data-x'] = '9';
		r.update(FastPathDiv, { tick: 'b', cls: 'row', attrs });
		expect(r.find('#div-tick').textContent).toBe('b');
		expect(target.getAttribute('data-x')).toBe('9');
	});

	it('removes an attribute when the spread drops its key', () => {
		const r = mount(FastPathDiv, {
			tick: 'a',
			cls: 'row',
			attrs: { 'data-x': '1', title: 'edge' },
		});
		const target = r.find('#fp-div');
		expect(target.getAttribute('title')).toBe('edge');

		r.update(FastPathDiv, { tick: 'b', cls: 'row', attrs: { 'data-x': '1' } });
		expect(target.getAttribute('title')).toBeNull();
		expect(target.getAttribute('data-x')).toBe('1');
	});

	it('still applies named prop and class changes beside an unchanged spread', () => {
		const r = mount(FastPathSvgEdge, { tick: 'a', ...EDGE });
		const target = r.find('#fp-edge');
		r.update(FastPathSvgEdge, { ...EDGE, tick: 'b', cls: 'hot' });
		expect(target.getAttribute('class')).toBe('hot');
		expect(target.getAttribute('data-x')).toBe('1');
	});

	it('applies multiple spread sources in order, later sources winning', () => {
		const r = mount(FastPathMulti, {
			tick: 'a',
			a: { 'data-x': '1', title: 'a' },
			b: { 'data-y': '2' },
		});
		const target = r.find('#fp-multi');
		expect(target.getAttribute('data-x')).toBe('1');
		expect(target.getAttribute('data-y')).toBe('2');

		// Later sources override earlier ones — the merged ordering contract.
		r.update(FastPathMulti, {
			tick: 'b',
			a: { 'data-x': '1', title: 'a' },
			b: { 'data-y': '3', 'data-x': '4' },
		});
		expect(target.getAttribute('data-x')).toBe('4');
		expect(target.getAttribute('data-y')).toBe('3');
	});

	it('still reasserts a controlled input value arriving through a spread source', () => {
		const r = mount(FastPathInput, {
			tick: 'a',
			attrs: { value: 'first', 'data-x': '1' },
		});
		const input = r.find('#fp-input') as HTMLInputElement;
		expect(input.value).toBe('first');

		r.update(FastPathInput, {
			tick: 'b',
			attrs: { value: 'second', 'data-x': '1' },
		});
		expect(input.value).toBe('second');
	});

	it('evaluates a spread-source getter once per commit and writes its latest value', () => {
		let calls = 0;
		const attrs = {
			get title() {
				calls++;
				return 't' + calls;
			},
		};
		const r = mount(FastPathDiv, { tick: 'a', cls: 'row', attrs });
		const target = r.find('#fp-div');
		expect(target.getAttribute('title')).toBe('t1');

		r.update(FastPathDiv, { tick: 'b', cls: 'row', attrs });
		// The getter produced a new value on the second read — the commit must
		// see the change and write it.
		expect(target.getAttribute('title')).toBe('t2');
		expect(calls).toBe(2);
	});
});
