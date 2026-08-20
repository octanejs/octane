import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import { createElement } from 'octane';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Tile from '../src/Tile.tsrx';

afterEach(cleanup);

const defaultProps = {
	activeStartDate: new Date(2019, 0, 1),
	children: '',
	classes: [],
	date: new Date(2019, 0, 1),
	maxDateTransform: (date: Date) => date,
	minDateTransform: (date: Date) => date,
	view: 'month' as const,
};

describe('<Tile /> component', () => {
	// Per upstream/canonical/src/Tile.spec.tsx:18.
	it('renders button properly', () => {
		const { container } = render(Tile, { props: defaultProps });

		expect(container.querySelector('button')).not.toBeNull();
	});

	// Per upstream/canonical/src/Tile.spec.tsx:24.
	it('passes onClick to button', () => {
		const onClick = vi.fn();
		const { container } = render(Tile, { props: { ...defaultProps, onClick } });

		fireEvent.click(container.querySelector('button') as HTMLButtonElement);

		expect(onClick).toHaveBeenCalledTimes(1);
		expect(onClick).toHaveBeenCalledWith(defaultProps.date, expect.any(MouseEvent));
	});

	// Per upstream/canonical/src/Tile.spec.tsx:36.
	it('passes classes to button properly', () => {
		const classes = ['a', 'b', 'c'];
		const { container } = render(Tile, { props: { ...defaultProps, classes } });
		const button = container.querySelector('button') as HTMLButtonElement;

		for (const className of classes) {
			expect(button.classList.contains(className)).toBe(true);
		}
	});

	// Per upstream/canonical/src/Tile.spec.tsx:48.
	it('renders children properly', () => {
		const children = 'Hello';
		const { container } = render(Tile, { props: { ...defaultProps, children } });

		expect(container.textContent).toContain(children);
	});

	// Per upstream/canonical/src/Tile.spec.tsx:56.
	it('does not render abbr by default', () => {
		const { container } = render(Tile, { props: defaultProps });

		expect(container.querySelector('abbr')).toBeNull();
	});

	// Per upstream/canonical/src/Tile.spec.tsx:62.
	it('calls formatAbbr properly', () => {
		const date = new Date(2019, 5, 1);
		const formatAbbr = vi.fn(() => 'June 2019');
		const locale = 'en-US';

		render(Tile, { props: { ...defaultProps, date, formatAbbr, locale } });

		expect(formatAbbr).toHaveBeenCalledTimes(1);
		expect(formatAbbr).toHaveBeenCalledWith(locale, date);
	});

	// Per upstream/canonical/src/Tile.spec.tsx:73.
	it('renders abbr with children properly given formatAbbr', () => {
		const children = 'Hello';
		const ariaLabel = 'ariaLabel';
		const { container } = render(Tile, {
			props: { ...defaultProps, children, formatAbbr: () => ariaLabel },
		});
		const abbr = container.querySelector('abbr');

		expect(abbr?.textContent).toBe(children);
		expect(abbr?.getAttribute('aria-label')).toBe(ariaLabel);
	});

	// Per upstream/canonical/src/Tile.spec.tsx:127.
	it('applies tileClassName to button properly given function', () => {
		const className = 'className';
		const { container } = render(Tile, {
			props: { ...defaultProps, tileClassName: () => className },
		});

		expect(container.querySelector('button')?.classList.contains(className)).toBe(true);
	});

	// Per upstream/canonical/src/Tile.spec.tsx:184.
	it('applies tileContent to button properly given function', () => {
		const content = 'content';
		const { container } = render(Tile, {
			props: {
				...defaultProps,
				tileContent: () => createElement('span', { className: 'content' }, content),
			},
		});

		expect(container.querySelector('.content')?.textContent).toBe(content);
	});

	// Per upstream/canonical/src/Tile.spec.tsx:229.
	it('disables button properly given tileDisabled returning true', () => {
		const { container } = render(Tile, {
			props: { ...defaultProps, tileDisabled: () => true },
		});

		expect((container.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
	});
});
