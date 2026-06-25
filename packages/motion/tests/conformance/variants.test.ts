import { describe, it, expect, vi } from 'vitest';
const { animateMock } = vi.hoisted(() => ({ animateMock: vi.fn(() => ({ stop: vi.fn() })) }));
vi.mock('motion', () => ({
	animate: animateMock,
	hover: vi.fn(() => vi.fn()),
	press: vi.fn(() => vi.fn()),
	inView: vi.fn(() => vi.fn()),
}));
import { mount, nextPaint } from '../_helpers';
import { VariantTree } from '../_fixtures/variants.tsrx';

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
});
