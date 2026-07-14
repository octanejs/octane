import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@octanejs/testing-library';
import { App, MemberCard } from '@octane-eval-submission/octane.composed-team-board/src/App.tsrx';

afterEach(cleanup);

describe('composed team board', () => {
	it('has MemberCard invoke its parent callback twice from one native click', () => {
		const onApplaud = vi.fn();
		render(MemberCard, {
			props: {
				member: { id: 'lin', name: 'Lin', bio: 'Builds resilient compilers' },
				applause: 0,
				onApplaud,
			},
		});

		fireEvent.click(screen.getByRole('button', { name: 'Applaud twice Lin' }));
		expect(onApplaud.mock.calls).toEqual([['lin'], ['lin']]);
	});

	it('keeps card-local details separate from lifted applause state', () => {
		render(App);

		expect(screen.getByLabelText('Total applause').textContent).toBe('0');
		expect(screen.queryByText('Designs accessible systems')).toBeNull();

		fireEvent.click(screen.getByRole('button', { name: 'Show details Ada' }));
		expect(screen.getByText('Designs accessible systems')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Hide details Ada' })).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Applaud twice Ada' }));
		expect(screen.getByLabelText('Applause Ada').textContent).toBe('2');
		expect(screen.getByLabelText('Total applause').textContent).toBe('2');

		fireEvent.click(screen.getByRole('button', { name: 'Applaud twice Grace' }));
		expect(screen.getByLabelText('Applause Grace').textContent).toBe('2');
		expect(screen.getByLabelText('Total applause').textContent).toBe('4');
		expect(screen.getByText('Designs accessible systems')).toBeTruthy();
	});

	it('uses keyed composition to preserve a card across reordering', () => {
		const view = render(App);
		const adaBefore = view.container.querySelector<HTMLElement>('[data-member-id="ada"]')!;

		fireEvent.click(screen.getByRole('button', { name: 'Show details Ada' }));
		fireEvent.click(screen.getByRole('button', { name: 'Reverse team' }));

		const cards = [...view.container.querySelectorAll<HTMLElement>('[data-member-id]')];
		expect(cards.map((card) => card.dataset.memberId)).toEqual(['grace', 'ada']);
		expect(view.container.querySelector('[data-member-id="ada"]')).toBe(adaBefore);
		expect(screen.getByText('Designs accessible systems')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Hide details Ada' })).toBeTruthy();
	});
});
