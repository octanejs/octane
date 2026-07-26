import { describe, expect, it } from 'vitest';
import { mount } from './_helpers';
import {
	DirectChild,
	InsideArrayOfChildren,
	InsideConditionalArm,
	InsideKeyedLoop,
	InsideNestedBoundary,
} from './_fixtures/ast-rewrite-reach.tsrx';

const texts = (r: { container: HTMLElement }): string[] =>
	[...r.container.querySelectorAll('.out')].map((n) => n.textContent ?? '');

describe('copy-on-write rewrites reach every property shape', () => {
	// <ErrorBoundary> is lowered by a rewrite over the whole module body. If that
	// walk stops descending through a property shape, the element is never
	// lowered and the boundary silently stops catching.
	const cases: Array<[string, (explode: boolean) => { container: HTMLElement; unmount(): void }]> =
		[
			['direct child', (explode) => mount(DirectChild, { explode })],
			['array of children', (explode) => mount(InsideArrayOfChildren, { explode })],
			['conditional arm', (explode) => mount(InsideConditionalArm, { explode, on: true })],
			['nested boundary', (explode) => mount(InsideNestedBoundary, { explode })],
		];

	for (const [shape, render] of cases) {
		it(`catches from a boundary buried in an ${shape}`, () => {
			const ok = render(false);
			expect(texts(ok)).toContain('ok');
			ok.unmount();

			const caught = render(true);
			expect(texts(caught)).toContain('caught');
			expect(texts(caught)).not.toContain('ok');
			caught.unmount();
		});
	}

	it('catches per item from a boundary inside a keyed loop', () => {
		const r = mount(InsideKeyedLoop, {
			items: [
				{ id: 1, explode: false },
				{ id: 2, explode: true },
				{ id: 3, explode: false },
			],
		});
		expect(texts(r)).toEqual(['ok', 'caught', 'ok']);
		r.unmount();
	});
});
