import React from 'react';
import { act as reactAct } from 'react';
import { createRoot } from 'react-dom/client';
import { DayPicker as ReactDayPicker } from 'react-day-picker';
import { describe, expect, it } from 'vitest';
import { mount } from '../../../octane/tests/_helpers.ts';
import { DefaultConstraintsFixture, NavigationFixture } from '../_fixtures/calendar.tsrx';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
	true;

function isDayButton(button: Element): boolean {
	return /^\d+$/.test(button.textContent ?? '');
}

function dayCells(container: HTMLElement) {
	return [...container.querySelectorAll('[data-day]')];
}

function semanticSnapshot(container: HTMLElement) {
	return {
		caption: container.querySelector('[class*="month_caption"]')?.textContent,
		gridRole: container.querySelector('[role="grid"]')?.getAttribute('role'),
		weekdayCount: container.querySelectorAll('[role="columnheader"]').length,
		dayButtonCount: [...container.querySelectorAll('button')].filter(isDayButton).length,
		dayIds: dayCells(container).map(function (cell) {
			return cell.getAttribute('data-day');
		}),
		hiddenDays: dayCells(container)
			.filter(function (cell) {
				return cell.getAttribute('data-hidden') === 'true';
			})
			.map(function (cell) {
				return cell.getAttribute('data-day');
			}),
		outsideDays: dayCells(container)
			.filter(function (cell) {
				return cell.getAttribute('data-outside') === 'true';
			})
			.map(function (cell) {
				return cell.getAttribute('data-day');
			}),
		disabledDays: dayCells(container)
			.filter(function (cell) {
				const button = cell.querySelector('button');
				return button !== null && button.disabled;
			})
			.map(function (cell) {
				return cell.getAttribute('data-day');
			}),
	};
}

const defaultConstraintProps = {
	mode: 'single' as const,
	month: new Date(2026, 7, 1),
	disabled: new Date(2026, 7, 10),
	hidden: new Date(2026, 7, 11),
	showOutsideDays: true,
};

const navigationProps = {
	defaultMonth: new Date(2026, 7, 1),
};

async function mountReactDayPicker(props: React.ComponentProps<typeof ReactDayPicker>) {
	const reactContainer = document.createElement('div');
	const root = createRoot(reactContainer);
	await reactAct(function () {
		root.render(React.createElement(ReactDayPicker, props));
	});
	return {
		container: reactContainer,
		async unmount() {
			await reactAct(function () {
				root.unmount();
			});
		},
	};
}

function nextNavButton(container: HTMLElement) {
	return container.querySelector('button[aria-label*="next"]') as HTMLButtonElement;
}

/**
 * Drive the same interaction on React and Octane, then compare semantic snapshots.
 * Initial mount is one step; each later call is a further shared step.
 */
async function expectMatchingStep(
	reactContainer: HTMLElement,
	octaneContainer: HTMLElement,
	stepName: string,
	drive?: (container: HTMLElement) => void | Promise<void>,
) {
	if (drive) {
		await reactAct(async function () {
			await drive(reactContainer);
		});
		await drive(octaneContainer);
	}
	expect(semanticSnapshot(octaneContainer), stepName).toEqual(semanticSnapshot(reactContainer));
}

describe('differential: @octanejs/day-picker vs react-day-picker 10.0.1', () => {
	it('matches the default calendar semantic shape and constraints', async () => {
		const react = await mountReactDayPicker(defaultConstraintProps);
		const octane = mount(DefaultConstraintsFixture);
		await expectMatchingStep(react.container, octane.container, 'mount');
		octane.unmount();
		await react.unmount();
	});

	it('matches React month navigation output', async () => {
		const react = await mountReactDayPicker(navigationProps);
		const octane = mount(NavigationFixture);
		await expectMatchingStep(react.container, octane.container, 'mount');
		await expectMatchingStep(react.container, octane.container, 'next-month', function (container) {
			nextNavButton(container).click();
		});
		octane.unmount();
		await react.unmount();
	});
});
