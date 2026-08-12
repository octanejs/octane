import { raf } from '@react-spring/rafz';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Controller } from '@octanejs/spring';
import { flushEffects, mount } from '../../../motion/tests/_helpers';
import {
	// Additional upstream provenance for shared adapted evidence:
	// Per packages/core/src/SpringContext.test.tsx:21

	SpringComponentFixture,
	TrailComponentFixture,
	TransitionComponentFixture,
} from '../_fixtures/components.tsrx';

afterEach(() => vi.restoreAllMocks());

describe('React Spring render-prop components', () => {
	// Per packages/core/src/hooks/useSpring.test.tsx:29
	it('renders Spring children with animated values', () => {
		raf.frameLoop = 'demand';
		const result = mount(SpringComponentFixture);
		flushEffects();
		raf.advance();

		expect((result.find('#spring-component') as HTMLElement).style.opacity).toBe('1');
		result.unmount();
		raf.frameLoop = 'always';
	});

	// Per packages/core/src/hooks/useTrail.test.tsx:19
	it('preserves keyed render-prop children when items reorder', () => {
		const first = { id: 'first', label: 'First' };
		const second = { id: 'second', label: 'Second' };
		for (const Fixture of [TrailComponentFixture, TransitionComponentFixture]) {
			const result = mount(Fixture, { items: [first, second] });
			flushEffects();
			const attribute = Fixture === TrailComponentFixture ? 'data-item-id' : 'data-transition-id';
			const firstNode = result.find(`[${attribute}="first"]`);
			const secondNode = result.find(`[${attribute}="second"]`);

			result.update(Fixture, { items: [second, first] });
			flushEffects();

			expect(result.findAll(`[${attribute}]`)).toEqual([secondNode, firstNode]);
			result.unmount();
		}
	});

	// Per packages/core/src/hooks/useTransition.test.tsx:25
	it('does not restart unchanged transitions on parent rerenders', () => {
		const item = { id: 'first', label: 'First' };
		const result = mount(TransitionComponentFixture, { items: [item] });
		flushEffects();
		const start = vi.spyOn(Controller.prototype, 'start');

		result.update(TransitionComponentFixture, { items: [item] });
		flushEffects();
		expect(start).not.toHaveBeenCalled();
		result.unmount();
	});
});
