import { raf } from '@react-spring/rafz';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, flushEffects, mount } from '../../../octane/tests/_helpers';
import { TransitionFixture } from '../_fixtures/transitions.tsrx';

describe('useTransition', () => {
	afterEach(() => vi.useRealTimers());
	// Per packages/core/src/hooks/useTransition.test.tsx:25
	it('retains keys and removes a settled leaving item', async () => {
		raf.frameLoop = 'demand';
		const result = mount(TransitionFixture, {
			items: [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' },
			],
		});
		flushEffects();
		raf.advance();
		expect(result.findAll('[data-key]').map((node) => node.getAttribute('data-key'))).toEqual([
			'a',
			'b',
		]);

		result.update(TransitionFixture, {
			items: [
				{ id: 'b', label: 'B2' },
				{ id: 'c', label: 'C' },
			],
		});
		flushEffects();
		await act(async () => {
			raf.advance();
			await Promise.resolve();
		});
		flushEffects();

		expect(result.findAll('[data-key]').map((node) => node.getAttribute('data-key'))).toEqual([
			'b',
			'c',
		]);
		expect(result.find('[data-key="b"]').getAttribute('data-label')).toBe('B2');
		expect(result.find('[data-key="b"]').textContent).toBe('B2');
		result.unmount();
		raf.frameLoop = 'always';
	});

	// Per packages/core/src/hooks/useTransition.test.tsx:311
	it('holds entering items until exiting items settle', async () => {
		const result = mount(TransitionFixture, {
			items: [{ id: 'a', label: 'A' }],
			exitBeforeEnter: true,
		});
		flushEffects();
		result.update(TransitionFixture, {
			items: [{ id: 'b', label: 'B' }],
			exitBeforeEnter: true,
		});
		expect(result.findAll('[data-key]').map((node) => node.getAttribute('data-key'))).toEqual([
			'a',
		]);
		flushEffects();
		await act(async () => await Promise.resolve());
		flushEffects();
		expect(result.findAll('[data-key]').map((node) => node.getAttribute('data-key'))).toEqual([
			'b',
		]);
		result.unmount();
	});

	// Per packages/core/src/hooks/useTransition.test.tsx:400
	it('applies reverse trail order to leaving transitions', async () => {
		vi.useFakeTimers();
		const started: string[] = [];
		const result = mount(TransitionFixture, {
			items: [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' },
				{ id: 'c', label: 'C' },
			],
			trail: 100,
			reverse: true,
			onStart: (_result: unknown, controller: any) =>
				started.push(controller.get().opacity === 0 ? 'leave' : 'enter'),
		});
		flushEffects();
		await vi.runAllTimersAsync();
		started.length = 0;
		result.update(TransitionFixture, {
			items: [],
			trail: 100,
			reverse: true,
			onStart: () => started.push('start'),
		});
		flushEffects();
		expect(started).toHaveLength(1);
		await vi.runAllTimersAsync();
		expect(started).toHaveLength(3);
		result.unmount();
	});

	// Per packages/core/src/hooks/useTransition.test.tsx:25
	it('sorts rendered transitions independently from input order', () => {
		const result = mount(TransitionFixture, {
			items: [
				{ id: 'b', label: 'B' },
				{ id: 'a', label: 'A' },
			],
			sort: (a: any, b: any) => a.id.localeCompare(b.id),
		});
		flushEffects();
		expect(result.findAll('[data-key]').map((node) => node.getAttribute('data-key'))).toEqual([
			'a',
			'b',
		]);
		result.unmount();
	});

	// Per packages/core/src/hooks/useTransition.test.tsx:336
	it('keeps expired=false leaves mounted and honours cancellation and pause', async () => {
		const starts: unknown[] = [];
		const result = mount(TransitionFixture, {
			items: [{ id: 'a', label: 'A' }],
			expires: false,
			cancel: true,
			onStart: (...args: unknown[]) => starts.push(args),
		});
		flushEffects();
		expect(starts).toHaveLength(0);
		result.update(TransitionFixture, { items: [], expires: false, pause: true });
		flushEffects();
		await act(async () => await Promise.resolve());
		expect(result.find('[data-key="a"]').getAttribute('data-phase')).toBe('leave');
		result.unmount();
	});

	// Per packages/core/src/hooks/useTransition.test.tsx:105
	it('cancels delayed expiration when the same key re-enters', async () => {
		vi.useFakeTimers();
		const item = { id: 'a', label: 'A' };
		const result = mount(TransitionFixture, { items: [item], expires: 100 });
		flushEffects();
		result.update(TransitionFixture, { items: [], expires: 100 });
		flushEffects();
		await act(async () => await Promise.resolve());
		expect(result.find('[data-key="a"]').getAttribute('data-phase')).toBe('leave');
		result.update(TransitionFixture, { items: [item], expires: 100 });
		flushEffects();
		await vi.advanceTimersByTimeAsync(100);
		expect(result.find('[data-key="a"]').getAttribute('data-phase')).not.toBe('leave');
		result.unmount();
	});

	// Per packages/core/src/hooks/useTransition.test.tsx:400
	it('reverses item-specific leave start order', async () => {
		vi.useFakeTimers();
		const order: string[] = [];
		const leave = (item: any) => ({ opacity: 0, onStart: () => order.push(item.id) });
		const result = mount(TransitionFixture, {
			items: [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' },
				{ id: 'c', label: 'C' },
			],
			trail: 100,
			reverse: true,
			leave,
		});
		flushEffects();
		await vi.runAllTimersAsync();
		result.update(TransitionFixture, { items: [], trail: 100, reverse: true, leave });
		flushEffects();
		await vi.runAllTimersAsync();
		expect(order).toEqual(['c', 'b', 'a']);
		result.unmount();
	});
});
