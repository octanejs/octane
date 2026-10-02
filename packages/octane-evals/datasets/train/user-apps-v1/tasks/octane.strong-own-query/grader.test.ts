import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import {
	expectStrongCompile,
	serverHTML,
	STRONG_COMPILE_TEST,
	submissionSource,
} from '../../strong-repair';

const TASK = 'octane.strong-own-query';

afterEach(cleanup);

describe(TASK, () => {
	it(STRONG_COMPILE_TEST, () => {
		expectStrongCompile(submissionSource(TASK));
	});

	it('server-renders two search panels without duplicate IDs', () => {
		const container = document.createElement('div');
		container.innerHTML = serverHTML(submissionSource(TASK));
		expect(container.querySelectorAll('input[type="search"]')).toHaveLength(2);
		const ids = [...container.querySelectorAll('[id]')].map((element) => element.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('focuses the search input in the panel whose button was clicked', async () => {
		const { App } = await import('@octane-eval-submission/octane.strong-own-query/src/App.tsrx');
		const view = render(App);
		const inputs = [...view.container.querySelectorAll('input')];
		const buttons = [...view.container.querySelectorAll('button')];

		fireEvent.click(buttons[1]);
		expect(document.activeElement).toBe(inputs[1]);
		fireEvent.click(buttons[0]);
		expect(document.activeElement).toBe(inputs[0]);
	});
});
