/**
 * `act` re-export — ports of react-testing-library@be9d81d
 * src/__tests__/act.js behaviors that apply to octane (octane's act is always
 * async; the sync/async act split is a React-18 compatibility artifact).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent, screen } from '@octanejs/testing-library';
import { EffectfulCounter } from './_fixtures/counter.tsrx';

afterEach(cleanup);

describe('act', () => {
	// Per react-testing-library src/__tests__/act.js:14 ("findByTestId returns the element")
	it('async findBy works inside an act-aware environment', async () => {
		const callback = vi.fn();
		render(EffectfulCounter, { props: { callback } });
		expect(await screen.findByRole('button')).toBeTruthy();
	});

	it('commits state updates scheduled inside the callback', async () => {
		const callback = vi.fn();
		render(EffectfulCounter, { props: { callback } });
		await act(async () => {
			fireEvent.click(screen.getByRole('button'));
		});
		expect(screen.getByRole('button').textContent).toBe('Count: 1');
	});

	it('propagates callback errors while resolving cleanly afterwards', async () => {
		await expect(
			act(() => {
				throw new Error('boom');
			}),
		).rejects.toThrow('boom');
		// The act scope unwound — a fresh render still works.
		const callback = vi.fn();
		const { container } = render(EffectfulCounter, { props: { callback } });
		expect(container.textContent).toBe('Count: 0');
	});
});
