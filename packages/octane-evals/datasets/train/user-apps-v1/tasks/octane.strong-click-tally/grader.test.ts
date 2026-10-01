import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import {
	expectStrongCompile,
	serverHTML,
	STRONG_COMPILE_TEST,
	submissionSource,
} from '../../strong-repair';

const TASK = 'octane.strong-click-tally';

afterEach(cleanup);

function labels(root: ParentNode): string[] {
	return [...root.querySelectorAll('button')].map((button) => button.textContent!.trim());
}

describe(TASK, () => {
	it(STRONG_COMPILE_TEST, () => {
		expectStrongCompile(submissionSource(TASK));
	});

	it('server-renders both tallies at zero', () => {
		const container = document.createElement('div');
		container.innerHTML = serverHTML(submissionSource(TASK));
		expect(labels(container)).toEqual(['Apples: 0', 'Pears: 0']);
	});

	it('counts each tally independently and starts again after a remount', async () => {
		const { App } = await import('@octane-eval-submission/octane.strong-click-tally/src/App.tsrx');
		const view = render(App);
		const [apples, pears] = view.container.querySelectorAll('button');

		fireEvent.click(apples);
		fireEvent.click(apples);
		fireEvent.click(pears);
		expect(labels(view.container)).toEqual(['Apples: 2', 'Pears: 1']);

		view.unmount();
		const again = render(App);
		expect(labels(again.container)).toEqual(['Apples: 0', 'Pears: 0']);
	});
});
