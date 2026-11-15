import { describe, it, expect, vi } from 'vitest';
const { animateMock } = vi.hoisted(() => ({ animateMock: vi.fn(() => ({ stop: vi.fn() })) }));
vi.mock('motion', () => ({
	animate: animateMock,
	hover: vi.fn(() => vi.fn()),
	press: vi.fn(() => vi.fn()),
	inView: vi.fn(() => vi.fn()),
}));
import { mount, nextPaint } from '../_helpers';
import {
	InheritedVariantCompletion,
	VariantCompletion,
	VariantTree,
} from '../_fixtures/variants.tsrx';

describe('variants', () => {
	it('resolves a label to a target, and propagates the active label to children', async () => {
		const r = mount(VariantTree);
		await nextPaint();
		const parent = r.find('#parent');
		const child = r.find('#child');
		// Parent resolves animate="visible" against its own variants.
		expect(animateMock).toHaveBeenCalledWith(parent, { opacity: 1 }, undefined);
		// Child has no explicit animate → inherits "visible" → resolves ITS variants.
		expect(animateMock).toHaveBeenCalledWith(child, { x: 100 }, undefined);
		r.unmount();
	});

	it('passes the authored definition of a completed host animation', async () => {
		const onComplete = vi.fn();
		const r = mount(VariantCompletion, { target: 'hidden', onComplete });
		try {
			await nextPaint();
			expect(onComplete).not.toHaveBeenCalled();
			r.update(VariantCompletion, { target: 'visible', onComplete });
			await nextPaint();
			expect(onComplete.mock.calls).toEqual([['visible']]);

			const target = Object.freeze({ opacity: 0.5, transition: Object.freeze({ duration: 0 }) });
			r.update(VariantCompletion, { target, onComplete });
			await nextPaint();
			expect(onComplete.mock.calls).toHaveLength(2);
			expect(onComplete.mock.lastCall?.[0]).toBe(target);

			r.update(VariantCompletion, { target: { ...target }, onComplete });
			await nextPaint();
			expect(onComplete.mock.calls).toHaveLength(2);
		} finally {
			r.unmount();
		}
	});

	it('passes the inherited label from a completed child animation', async () => {
		const onComplete = vi.fn();
		const r = mount(InheritedVariantCompletion, { label: 'hidden', onComplete });
		try {
			await nextPaint();
			expect(onComplete).not.toHaveBeenCalled();
			r.update(InheritedVariantCompletion, { label: 'visible', onComplete });
			await nextPaint();
			expect(onComplete.mock.calls).toEqual([['visible']]);
		} finally {
			r.unmount();
		}
	});
});
