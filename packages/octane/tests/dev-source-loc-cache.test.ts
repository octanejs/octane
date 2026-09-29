import { expect, it } from 'vitest';
import { createElement } from 'octane';
import { mount } from './_helpers.js';

function Cell(props: { index: number }) {
	return createElement('span', { className: 'cell' }, createElement('b', null, props.index));
}

function List(props: { items: number[] }) {
	return createElement(
		'ul',
		null,
		props.items.map((index) =>
			createElement('li', { key: index, className: 'row' }, createElement(Cell, { index })),
		),
	);
}

// The DEV source-location fallback reads Function#toString. Form diagnostics walk
// every ancestor block per mounted host, so an uncached lookup rescans the same
// component source once per element and dominates dev-mode mount time.
it('reads each component source at most once across mounts', () => {
	const original = Function.prototype.toString;
	const reads = new Map<unknown, number>();
	Function.prototype.toString = function (this: unknown) {
		reads.set(this, (reads.get(this) ?? 0) + 1);
		return original.call(this);
	};
	try {
		for (let round = 0; round < 3; round++) {
			const rendered = mount(List, { items: Array.from({ length: 20 }, (_, index) => index) });
			expect(rendered.findAll('li.row')).toHaveLength(20);
			rendered.unmount();
		}
	} finally {
		Function.prototype.toString = original;
	}
	expect(Math.max(0, ...reads.values())).toBeLessThanOrEqual(1);
});
