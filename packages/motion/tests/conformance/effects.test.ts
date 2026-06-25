/**
 * Animation + gesture EFFECTS, with motion's engine mocked so we can assert the
 * exact wiring: the layout effects fire, capture the host node, call `animate` with
 * initial/target/transition, wire `hover`/`press`, and clean up on unmount. This is
 * the effects-correctness check the port is meant to provide.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { animateMock, hoverMock, pressMock } = vi.hoisted(() => ({
	animateMock: vi.fn(() => ({ stop: vi.fn() })),
	hoverMock: vi.fn(() => vi.fn()),
	pressMock: vi.fn(() => vi.fn()),
}));
vi.mock('motion', () => ({ animate: animateMock, hover: hoverMock, press: pressMock }));

import { mount, nextPaint } from '../_helpers';
import { Box, HoverBox } from '../_fixtures/boxes.tsrx';

beforeEach(() => {
	animateMock.mockReset();
	animateMock.mockReturnValue({ stop: vi.fn() });
	hoverMock.mockReset();
	hoverMock.mockReturnValue(vi.fn());
	pressMock.mockReset();
	pressMock.mockReturnValue(vi.fn());
});

describe('animations', () => {
	it('applies initial instantly, then animates to the target with the transition', async () => {
		const r = mount(Box);
		await nextPaint();
		const div = r.find('#box');
		expect(animateMock).toHaveBeenCalledWith(div, { opacity: 0 }, { duration: 0 });
		expect(animateMock).toHaveBeenCalledWith(div, { opacity: 1, x: 100 }, { duration: 0.3 });
		r.unmount();
	});

	it('stops the animation on unmount (effect cleanup)', async () => {
		const stop = vi.fn();
		animateMock.mockReturnValue({ stop });
		const r = mount(Box);
		await nextPaint();
		r.unmount();
		expect(stop).toHaveBeenCalled();
	});
});

describe('gestures', () => {
	it('wires hover + press to the node, animating on start and back on end', async () => {
		const r = mount(HoverBox);
		await nextPaint();
		const div = r.find('#box');
		expect(hoverMock).toHaveBeenCalledWith(div, expect.any(Function));
		expect(pressMock).toHaveBeenCalledWith(div, expect.any(Function));

		animateMock.mockClear();
		const onHoverStart = hoverMock.mock.calls[0][1] as () => () => void;
		const onHoverEnd = onHoverStart();
		expect(animateMock).toHaveBeenCalledWith(div, { scale: 1.1 }, undefined);
		onHoverEnd();
		expect(animateMock).toHaveBeenCalledWith(div, { scale: 1 }, undefined); // base = animate
		r.unmount();
	});

	it('removes gesture listeners on unmount', async () => {
		const hoverCleanup = vi.fn();
		hoverMock.mockReturnValue(hoverCleanup);
		const r = mount(HoverBox);
		await nextPaint();
		r.unmount();
		expect(hoverCleanup).toHaveBeenCalled();
	});
});
