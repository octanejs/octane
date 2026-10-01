import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from './_helpers.js';
import {
	UnchangedSpreadCustom,
	UnchangedSpreadDanger,
	UnchangedSpreadInput,
	UnchangedSpreadLabel,
	UnchangedSpreadRow,
	UnchangedSpreadScoped,
} from './_fixtures/unchanged-spread-bail.tsrx';

// A commit whose spread sources resolve to the same prop record as the previous
// commit must leave the host's DOM completely untouched. The oracles sit on the
// DOM boundary — MutationObserver records and setAttribute/removeAttribute call
// counts — never on runtime internals.

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

afterEach(() => {
	vi.restoreAllMocks();
});

describe('unchanged spread commits', () => {
	it('writes nothing to the DOM when a stable source re-resolves to the same record', () => {
		const setAttribute = vi.spyOn(Element.prototype, 'setAttribute');
		const removeAttribute = vi.spyOn(Element.prototype, 'removeAttribute');
		const r = mount(UnchangedSpreadRow, {
			tick: 'a',
			spread: { title: 'stable', 'data-x': '1', className: 'row', 'data-nan': NaN },
		});
		const target = r.find('#spread-target');
		// Mount wrote every prop, including the NaN-valued attribute.
		expect(target.getAttribute('title')).toBe('stable');
		expect(target.getAttribute('data-nan')).toBe('NaN');
		const observer = watchWrites(target);
		setAttribute.mockClear();
		removeAttribute.mockClear();

		// A real commit runs — the sibling text updates — with a stable source.
		r.update(UnchangedSpreadRow, {
			tick: 'b',
			spread: { title: 'stable', 'data-x': '1', className: 'row', 'data-nan': NaN },
		});
		expect(r.find('#tick').textContent).toBe('b');
		// A FRESH source object resolving to the same record bails just the same:
		// the compare is on resolved output, never source identity (`data-nan`
		// carries NaN so a `===` per-key skip cannot hide a genuine write).
		r.update(UnchangedSpreadRow, {
			tick: 'c',
			spread: { className: 'row', 'data-nan': NaN, 'data-x': '1', title: 'stable' },
		});
		expect(r.find('#tick').textContent).toBe('c');

		expect(observer.takeRecords()).toEqual([]);
		expect(setAttribute).not.toHaveBeenCalled();
		expect(removeAttribute).not.toHaveBeenCalled();
		expect(target.getAttribute('class')).toBe('row');
		expect(target.getAttribute('data-nan')).toBe('NaN');
		observer.disconnect();
		r.unmount();
	});

	// Per ReactJSXTransformIntegration-test.js:95's exactly-once contract, on the
	// update path: each commit snapshots the spread once, so an unchanged commit
	// must still evaluate the source getter once — the resolve pass cannot be
	// skipped (its output is what the bail compares).
	it('evaluates a spread source getter exactly once per commit, unchanged or not', () => {
		const html = { __html: '<b>raw</b>' };
		let reads = 0;
		const source = (title: string) =>
			Object.defineProperty({ title }, 'dangerouslySetInnerHTML', {
				enumerable: true,
				get() {
					reads++;
					return html;
				},
			});
		const r = mount(UnchangedSpreadDanger, { tick: 'a', spread: source('m') });
		const target = r.find('#spread-danger');
		expect(target.innerHTML).toBe('<b>raw</b>');

		reads = 0;
		r.update(UnchangedSpreadDanger, { tick: 'b', spread: source('m') });
		expect(reads).toBe(1);
		reads = 0;
		r.update(UnchangedSpreadDanger, { tick: 'c', spread: source('n') });
		expect(reads).toBe(1);
		expect(target.innerHTML).toBe('<b>raw</b>');
		expect(target.getAttribute('title')).toBe('n');
		r.unmount();
	});

	it('still removes a prop whose key disappears from the resolved record', () => {
		const r = mount(UnchangedSpreadRow, {
			tick: 'a',
			spread: { title: 'stable', 'data-gone': 'x' },
		});
		const target = r.find('#spread-target');
		expect(target.getAttribute('data-gone')).toBe('x');
		r.update(UnchangedSpreadRow, { tick: 'b', spread: { title: 'stable' } });
		expect(target.hasAttribute('data-gone')).toBe(false);
		expect(target.getAttribute('title')).toBe('stable');
		r.unmount();
	});

	it('keeps the htmlFor/for and className/class aliases identical across unchanged commits', () => {
		const r = mount(UnchangedSpreadLabel, {
			tick: 'a',
			spread: { htmlFor: 'field', className: 'lbl' },
		});
		const label = r.find('#spread-label');
		expect(label.getAttribute('for')).toBe('field');
		expect(label.getAttribute('class')).toBe('lbl');
		const observer = watchWrites(label);

		// `class` spelled differently resolves to the same record — still no writes.
		r.update(UnchangedSpreadLabel, {
			tick: 'b',
			spread: { htmlFor: 'field', class: 'lbl' },
		});
		expect(observer.takeRecords()).toEqual([]);
		expect(label.getAttribute('for')).toBe('field');
		expect(label.getAttribute('class')).toBe('lbl');
		expect(label.hasAttribute('htmlfor')).toBe(false);

		// A changed alias winner still writes through the normal path.
		r.update(UnchangedSpreadLabel, {
			tick: 'c',
			spread: { htmlFor: 'other', className: 'lbl' },
		});
		expect(label.getAttribute('for')).toBe('other');
		observer.disconnect();
		r.unmount();
	});

	it('still reasserts a controlled input after live-value drift', () => {
		const spread = { value: 'locked' };
		const r = mount(UnchangedSpreadInput, { tick: 'a', spread });
		const input = r.find('#spread-input') as HTMLInputElement;
		expect(input.value).toBe('locked');

		// The resolved record is unchanged, but the live DOM drifted: the
		// controlled value must be reasserted — form hosts never take the bail.
		input.value = 'drift';
		r.update(UnchangedSpreadInput, { tick: 'b', spread });
		expect(r.find('#input-tick').textContent).toBe('b');
		expect(input.value).toBe('locked');
		r.unmount();
	});

	it('swaps a changed ref while leaving an unchanged ref untouched', () => {
		const refA = vi.fn();
		const refB = vi.fn();
		const r = mount(UnchangedSpreadRow, {
			tick: 'a',
			spread: { ref: refA, title: 's' },
		});
		const target = r.find('#spread-target');
		expect(refA).toHaveBeenCalledWith(target);

		refA.mockClear();
		r.update(UnchangedSpreadRow, { tick: 'b', spread: { ref: refA, title: 's' } });
		expect(refA).not.toHaveBeenCalled();

		r.update(UnchangedSpreadRow, { tick: 'c', spread: { ref: refB, title: 's' } });
		expect(refA).toHaveBeenCalledWith(null);
		expect(refB).toHaveBeenCalledWith(target);
		r.unmount();
	});

	it('does not re-inject an unchanged dangerouslySetInnerHTML source', () => {
		const html = { __html: '<b>raw</b>' };
		const r = mount(UnchangedSpreadDanger, {
			tick: 'a',
			spread: { dangerouslySetInnerHTML: html },
		});
		const target = r.find('#spread-danger');
		expect(target.innerHTML).toBe('<b>raw</b>');
		// A marker child proves no innerHTML re-assignment happened: re-injecting
		// the same markup would still replace every child.
		target.appendChild(document.createElement('i'));
		const observer = watchWrites(target);
		r.update(UnchangedSpreadDanger, {
			tick: 'b',
			spread: { dangerouslySetInnerHTML: html },
		});
		expect(observer.takeRecords()).toEqual([]);
		expect(target.querySelector('i')).not.toBeNull();
		expect(target.innerHTML).toBe('<b>raw</b><i></i>');
		observer.disconnect();
		r.unmount();
	});

	it('leaves custom-element verbatim attributes identical on an unchanged commit', () => {
		const setAttribute = vi.spyOn(Element.prototype, 'setAttribute');
		const r = mount(UnchangedSpreadCustom, {
			tick: 'a',
			spread: { 'data-x': '1', 'aria-label': 'hi', htmlFor: 'raw', 'data-nan': NaN },
		});
		const el = r.find('#spread-custom');
		expect(el.getAttribute('data-x')).toBe('1');
		expect(el.getAttribute('aria-label')).toBe('hi');
		// Custom elements keep the authored name verbatim — no htmlFor→for alias.
		expect(el.getAttribute('htmlfor')).toBe('raw');
		setAttribute.mockClear();
		r.update(UnchangedSpreadCustom, {
			tick: 'b',
			spread: { 'aria-label': 'hi', 'data-nan': NaN, 'data-x': '1', htmlFor: 'raw' },
		});
		expect(r.find('#custom-tick').textContent).toBe('b');
		expect(setAttribute).not.toHaveBeenCalled();
		expect(el.getAttribute('htmlfor')).toBe('raw');
		r.unmount();
	});

	it('preserves the composed scope-hash class across an unchanged commit', () => {
		const r = mount(UnchangedSpreadScoped, {
			tick: 'a',
			spread: { title: 's' },
		});
		const el = r.find('#spread-scoped');
		const cls = el.getAttribute('class') ?? '';
		// The scope hash merges onto the authored/direct class winner.
		expect(cls.split(' ')).toContain('uss-scope');
		expect(cls.split(' ').length).toBeGreaterThan(1);
		const observer = watchWrites(el);
		r.update(UnchangedSpreadScoped, { tick: 'b', spread: { title: 's' } });
		expect(r.find('#scoped-tick').textContent).toBe('b');
		expect(observer.takeRecords()).toEqual([]);
		expect(el.getAttribute('class')).toBe(cls);
		observer.disconnect();
		r.unmount();
	});
});
