import { describe, it, expect, vi } from 'vitest';
const { animateMock } = vi.hoisted(() => ({ animateMock: vi.fn(() => ({ stop: vi.fn() })) }));
vi.mock('motion', () => ({
	animate: animateMock,
	hover: vi.fn(() => vi.fn()),
	press: vi.fn(() => vi.fn()),
	inView: vi.fn(() => vi.fn()),
}));
import { mount, nextPaint } from '../_helpers';
import { ConfigTree } from '../_fixtures/config.tsrx';

describe('MotionConfig', () => {
	it('provides a default transition inherited by descendant motion elements', async () => {
		const r = mount(ConfigTree);
		await nextPaint();
		const div = r.find('#box');
		// motion.div has no transition of its own → inherits MotionConfig's.
		expect(animateMock).toHaveBeenCalledWith(div, { opacity: 1 }, { duration: 0.5 });
		r.unmount();
	});
});
