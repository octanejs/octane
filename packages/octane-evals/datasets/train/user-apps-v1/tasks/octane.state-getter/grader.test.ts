import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@octanejs/testing-library';
import { App } from '@octane-eval-submission/octane.state-getter/src/App.tsrx';

afterEach(cleanup);

describe('current-state getter', () => {
	it('observes sequential updates immediately and from an older scheduled job', () => {
		const jobs: Array<() => void> = [];
		const onImmediate = vi.fn();
		const onDeferred = vi.fn();
		render(App, {
			props: {
				onImmediate,
				schedule: (job: () => void) => jobs.push(job),
				onDeferred,
			},
		});

		expect(screen.getByLabelText('Current count').textContent).toBe('0');
		fireEvent.click(screen.getByRole('button', { name: 'Report later' }));
		expect(jobs).toHaveLength(1);

		fireEvent.click(screen.getByRole('button', { name: 'Increment twice' }));
		expect(onImmediate).toHaveBeenCalledOnce();
		expect(onImmediate).toHaveBeenCalledWith(2);
		expect(screen.getByLabelText('Current count').textContent).toBe('2');

		fireEvent.click(screen.getByRole('button', { name: 'Increment' }));
		expect(screen.getByLabelText('Current count').textContent).toBe('3');

		jobs[0]();
		expect(onDeferred).toHaveBeenCalledOnce();
		expect(onDeferred).toHaveBeenCalledWith(3);
	});
});
