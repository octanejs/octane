import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@octanejs/testing-library';
import { App, MessageRow } from '@octane-eval-submission/octane.native-inbox/src/App.tsrx';

afterEach(cleanup);

describe('native inbox events', () => {
	it('stops a nested delete click before it selects the row', () => {
		const onSelect = vi.fn();
		const onDelete = vi.fn();
		const outerClick = vi.fn();
		document.addEventListener('click', outerClick);
		render(MessageRow, {
			props: {
				message: { id: 7, title: 'Incident review' },
				selected: false,
				onSelect,
				onDelete,
			},
		});

		const deleteButton = screen.getByRole('button', { name: 'Delete Incident review' });
		expect(fireEvent.keyDown(deleteButton, { key: ' ' })).toBe(true);
		expect(onSelect).not.toHaveBeenCalled();
		expect(onDelete).not.toHaveBeenCalled();

		fireEvent.click(deleteButton);
		document.removeEventListener('click', outerClick);
		expect(onDelete).toHaveBeenCalledOnce();
		expect(onDelete).toHaveBeenCalledWith(7);
		expect(onSelect).not.toHaveBeenCalled();
		expect(outerClick).not.toHaveBeenCalled();

		const row = screen.getByText('Incident review').closest('li')!;
		fireEvent.click(row);
		fireEvent.keyDown(row, { key: 'Enter' });
		fireEvent.keyDown(row, { key: ' ' });
		expect(onSelect).toHaveBeenCalledTimes(3);
		expect(onSelect).toHaveBeenLastCalledWith(7);
	});

	it('selects, deletes, clears selection, and renders the empty branch', () => {
		render(App);

		expect(screen.getByRole('status').textContent).toBe('No message selected');
		fireEvent.click(screen.getByRole('button', { name: 'Delete Deploy report' }));
		expect(screen.queryByText('Deploy report')).toBeNull();
		expect(screen.getByRole('status').textContent).toBe('No message selected');

		const releaseRow = screen.getByText('Release notes').closest('li')!;
		fireEvent.click(releaseRow);
		expect(screen.getByRole('status').textContent).toBe('Selected: Release notes');
		expect(releaseRow.classList.contains('selected')).toBe(true);
		expect(releaseRow.getAttribute('aria-current')).toBe('true');

		fireEvent.click(screen.getByRole('button', { name: 'Delete Release notes' }));
		expect(screen.getByText('Inbox empty')).toBeTruthy();
		expect(screen.getByRole('status').textContent).toBe('No message selected');
	});
});
