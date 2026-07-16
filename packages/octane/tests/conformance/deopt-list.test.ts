/**
 * Runtime de-opt path — arrays of host descriptors at a child position
 * (`{items.map((x) => createElement('li', { key }, x.label))}`, arrays through
 * props). This is the sound runtime handling for dynamically-produced markup:
 * `childSlot` detects an array at runtime and reconciles it keyed by
 * `descriptor.key` (index fallback + dev warning), reusing the LIS reconciler.
 *
 * v1 scope: host elements + primitives + nested arrays. Component descriptors on
 * this path are unsupported (use `@for (...; key ...)`); host elements are
 * REBUILT on re-render (no node-identity preservation across parent renders).
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '../_helpers';
import {
	DeoptList,
	DeoptListStateful,
	DeoptUnkeyed,
	DestructuredJsxList,
	JsxList,
} from '../_fixtures/deopt-list.tsrx';

const items = (...ids: number[]) => ids.map((id) => ({ id, label: String.fromCharCode(96 + id) }));
const rows = (r: ReturnType<typeof mount>) => r.findAll('li').map((li) => li.textContent);

describe('de-opt array child — render', () => {
	it('renders an array of host descriptors with attributes', () => {
		const r = mount(DeoptList, { items: items(1, 2, 3) });
		expect(rows(r)).toEqual(['a', 'b', 'c']);
		expect(r.findAll('li.row')).toHaveLength(3);
		// `key` is lifted out — never emitted as a DOM attribute (React parity).
		expect(r.find('li').hasAttribute('key')).toBe(false);
		r.unmount();
	});

	it('renders an empty array as nothing', () => {
		const r = mount(DeoptList, { items: [] });
		expect(r.findAll('li')).toHaveLength(0);
		r.unmount();
	});
});

describe('de-opt array child — keyed reconciliation', () => {
	it('reorders by key (reverse)', () => {
		const r = mount(DeoptListStateful);
		expect(rows(r)).toEqual(['a', 'b', 'c']);
		r.click('#reverse');
		expect(rows(r)).toEqual(['c', 'b', 'a']);
		r.unmount();
	});

	it('appends + removes by key', () => {
		const r = mount(DeoptListStateful);
		r.click('#add');
		expect(rows(r)).toEqual(['a', 'b', 'c', 'x']);
		r.click('#remove');
		expect(rows(r)).toEqual(['b', 'c', 'x']);
		r.unmount();
	});
});

describe('de-opt array child — plain JSX `.map` (compiler lowering)', () => {
	it('compiles `{items.map((it) => <li key={it.id}>{it.label}</li>)}` and renders it', () => {
		const r = mount(JsxList, { items: items(1, 2, 3) });
		expect(rows(r)).toEqual(['a', 'b', 'c']);
		expect(r.find('li').hasAttribute('key')).toBe(false);
		r.unmount();
	});

	it('renders a keyed JSX list when the component destructures typed props', () => {
		const r = mount(DestructuredJsxList, { items: items(1, 2, 3) });
		expect(rows(r)).toEqual(['a', 'b', 'c']);
		expect(r.find('li').hasAttribute('key')).toBe(false);
		r.unmount();
	});
});

describe('de-opt array child — unkeyed (React parity)', () => {
	it('renders unkeyed items by index and warns once in dev', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const r = mount(DeoptUnkeyed, { items: items(1, 2) });
		expect(rows(r)).toEqual(['a', 'b']);
		// One-time dev warning about the missing key / index fallback.
		expect(warn).toHaveBeenCalled();
		expect(String(warn.mock.calls[0][0])).toMatch(/key/i);
		warn.mockRestore();
		r.unmount();
	});
});
