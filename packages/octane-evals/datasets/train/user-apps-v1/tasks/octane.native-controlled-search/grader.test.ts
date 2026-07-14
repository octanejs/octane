import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@octanejs/testing-library';
import {
	App,
	SearchField,
} from '@octane-eval-submission/octane.native-controlled-search/src/App.tsrx';

afterEach(cleanup);

describe('native controlled search', () => {
	it('delivers native input events and restores a rejected controlled edit', () => {
		const observations: Array<{ value: string; event: Event }> = [];
		render(SearchField, {
			props: {
				id: 'locked-search',
				value: 'locked',
				onQueryInput: (value: string, event: Event) => observations.push({ value, event }),
			},
		});
		const input = screen.getByRole('searchbox', { name: 'Search' }) as HTMLInputElement;

		fireEvent.input(input, { target: { value: 'attempted edit' } });

		expect(observations).toHaveLength(1);
		expect(observations[0].value).toBe('attempted edit');
		expect(observations[0].event).toBeInstanceOf(Event);
		expect(observations[0].event.type).toBe('input');
		expect(observations[0].event.target).toBe(input);
		expect(input.value).toBe('locked');
	});

	it('accepts edits through state and clears the composed field', () => {
		const onQueryInput = vi.fn();
		render(App, { props: { onQueryInput } });
		const input = screen.getByRole('searchbox', { name: 'Search' }) as HTMLInputElement;
		const clear = screen.getByRole('button', { name: 'Clear search' }) as HTMLButtonElement;

		expect(input.value).toBe('');
		expect(clear.disabled).toBe(true);
		expect(screen.getByRole('status').textContent).toBe('Type to search');

		fireEvent.input(input, { target: { value: 'Octane hooks' } });
		expect(input.value).toBe('Octane hooks');
		expect(screen.getByRole('status').textContent).toBe('Searching for: Octane hooks');
		expect(clear.disabled).toBe(false);
		expect(onQueryInput).toHaveBeenCalledTimes(1);
		expect(onQueryInput.mock.calls[0][0]).toBe('Octane hooks');
		expect(onQueryInput.mock.calls[0][1]).toBeInstanceOf(Event);
		expect(onQueryInput.mock.calls[0][1].type).toBe('input');

		fireEvent.click(clear);
		expect(input.value).toBe('');
		expect(screen.getByRole('status').textContent).toBe('Type to search');
		expect(clear.disabled).toBe(true);
	});
});
