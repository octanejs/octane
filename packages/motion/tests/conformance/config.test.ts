import { describe, it, expect, vi } from 'vitest';
const { animateMock } = vi.hoisted(() => ({ animateMock: vi.fn(() => ({ stop: vi.fn() })) }));
vi.mock('motion', () => ({
	animate: animateMock,
	hover: vi.fn(() => vi.fn()),
	press: vi.fn(() => vi.fn()),
	inView: vi.fn(() => vi.fn()),
}));
import { mount, nextPaint } from '../_helpers';
import { ConfigTree, FilteredConfigTree } from '../_fixtures/config.tsrx';

describe('MotionConfig', () => {
	it('provides a default transition inherited by descendant motion elements', async () => {
		const r = mount(ConfigTree);
		await nextPaint();
		const div = r.find('#box');
		// motion.div has no transition of its own → inherits MotionConfig's.
		expect(animateMock).toHaveBeenCalledWith(div, { opacity: 1 }, { duration: 0.5 });
		r.unmount();
	});

	it('scopes prop filtering to its provider, with inheritance and explicit overrides', async () => {
		const ref = { current: null as HTMLButtonElement | null };
		const r = mount(FilteredConfigTree, {
			isValidProp: (key: string) => key !== 'data-private',
			onClick: vi.fn(),
			ref,
		});
		try {
			await nextPaint();
			for (const id of ['filtered', 'inherited']) {
				expect(r.find(`#${id}`).getAttribute('data-private')).toBeNull();
				expect(r.find(`#${id}`).getAttribute('data-public')).toBe('public');
			}
			expect(r.find('#overridden').getAttribute('data-private')).toBe('private');
			expect(r.find('#overridden').getAttribute('data-public')).toBeNull();
			for (const id of ['reset', 'outside']) {
				expect(r.find(`#${id}`).getAttribute('data-private')).toBe('private');
				expect(r.find(`#${id}`).getAttribute('data-public')).toBe('public');
			}
		} finally {
			r.unmount();
		}
	});

	it('updates the filter without replacing hosts or losing native events, refs, and styles', async () => {
		const ref = { current: null as HTMLButtonElement | null };
		const firstClick = vi.fn();
		const secondClick = vi.fn();
		const r = mount(FilteredConfigTree, {
			isValidProp: (key: string) => key === 'id' || key === 'data-public',
			onClick: firstClick,
			ref,
		});
		try {
			await nextPaint();
			const button = r.find('#filtered') as HTMLButtonElement;
			expect(ref.current).toBe(button);
			expect(button.style.opacity).toBe('0.5');
			expect(button.getAttribute('data-private')).toBeNull();
			button.click();
			expect(firstClick).toHaveBeenCalledOnce();
			expect(firstClick.mock.calls[0][0]).toBeInstanceOf(MouseEvent);
			r.update(FilteredConfigTree, {
				isValidProp: (key: string) => key === 'id' || key === 'data-private',
				onClick: secondClick,
				ref,
			});
			await nextPaint();
			expect(r.find('#filtered')).toBe(button);
			expect(ref.current).toBe(button);
			expect(button.style.opacity).toBe('0.5');
			expect(button.getAttribute('data-public')).toBeNull();
			expect(button.getAttribute('data-private')).toBe('private');
			expect(r.find('#inherited').getAttribute('data-public')).toBeNull();
			button.click();
			expect(firstClick).toHaveBeenCalledOnce();
			expect(secondClick).toHaveBeenCalledOnce();
		} finally {
			r.unmount();
		}
		expect(ref.current).toBeNull();
	});
});
