import { describe, it, expect, vi } from 'vitest';
const { animateMock, hoverMock } = vi.hoisted(() => ({
	animateMock: vi.fn(() => ({ stop: vi.fn() })),
	hoverMock: vi.fn(() => vi.fn()),
}));
vi.mock('motion', () => ({
	animate: animateMock,
	hover: hoverMock,
	press: vi.fn(() => vi.fn()),
	inView: vi.fn(() => vi.fn()),
}));
import { mount, nextPaint } from '../_helpers';
import { HoverWithTransition } from '../_fixtures/variant-transition.tsrx';

describe('gesture target with an inline transition', () => {
	it('separates the variant `transition` from values and uses it', async () => {
		const r = mount(HoverWithTransition);
		await nextPaint();
		const div = r.find('#box');
		animateMock.mockClear();
		const onHoverStart = hoverMock.mock.calls[0][1] as () => void;
		onHoverStart();
		// values + the target's own transition (not the element default).
		expect(animateMock).toHaveBeenCalledWith(div, { scale: 1.2 }, { duration: 0.8 });
		r.unmount();
	});
});
