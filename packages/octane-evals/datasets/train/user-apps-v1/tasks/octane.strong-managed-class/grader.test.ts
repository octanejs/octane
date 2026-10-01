import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import {
	expectStrongCompile,
	serverHTML,
	STRONG_COMPILE_TEST,
	submissionSource,
} from '../../strong-repair';

const TASK = 'octane.strong-managed-class';

afterEach(cleanup);

function selectedLabels(root: ParentNode): string[] {
	return [...root.querySelectorAll('button')]
		.filter((button) => button.classList.contains('tab') && button.classList.contains('selected'))
		.map((button) => button.textContent!);
}

describe(TASK, () => {
	it(STRONG_COMPILE_TEST, () => {
		expectStrongCompile(submissionSource(TASK));
	});

	it('server-renders the selected tab class', () => {
		const container = document.createElement('div');
		container.innerHTML = serverHTML(submissionSource(TASK));
		expect(
			[...container.querySelectorAll('button.tab')].map((button) => button.textContent),
		).toEqual(['Overview', 'Activity', 'Settings']);
		expect(selectedLabels(container)).toEqual(['Overview']);
	});

	it('moves the selected class on click', async () => {
		const { App } =
			await import('@octane-eval-submission/octane.strong-managed-class/src/App.tsrx');
		const view = render(App);
		const tab = (label: string) =>
			[...view.container.querySelectorAll('button')].find(
				(button) => button.textContent === label,
			)!;

		expect(selectedLabels(view.container)).toEqual(['Overview']);
		fireEvent.click(tab('Activity'));
		expect(selectedLabels(view.container)).toEqual(['Activity']);
		fireEvent.click(tab('Settings'));
		expect(selectedLabels(view.container)).toEqual(['Settings']);
		expect(tab('Overview').classList.contains('tab')).toBe(true);
	});
});
