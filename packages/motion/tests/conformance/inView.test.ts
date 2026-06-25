import { describe, it, expect, vi } from 'vitest';
const { animateMock, inViewMock } = vi.hoisted(() => ({
	animateMock: vi.fn(() => ({ stop: vi.fn() })),
	inViewMock: vi.fn(() => vi.fn()),
}));
vi.mock('motion', () => ({
	animate: animateMock,
	hover: vi.fn(() => vi.fn()),
	press: vi.fn(() => vi.fn()),
	inView: inViewMock,
}));
import { mount, nextPaint } from '../_helpers';
import { InViewBox } from '../_fixtures/inview.tsrx';

describe('whileInView', () => {
	it('wires inView to the node and animates the target on enter', async () => {
		const r = mount(InViewBox);
		await nextPaint();
		const div = r.find('#box');
		expect(inViewMock).toHaveBeenCalledWith(div, expect.any(Function), undefined);

		animateMock.mockClear();
		const onEnter = inViewMock.mock.calls[0][1] as () => void;
		onEnter();
		expect(animateMock).toHaveBeenCalledWith(div, { opacity: 1 }, { duration: 0.2 });
		r.unmount();
	});
});
