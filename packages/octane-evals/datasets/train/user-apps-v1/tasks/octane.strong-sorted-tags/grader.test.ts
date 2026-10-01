import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import {
	expectStrongCompile,
	serverHTML,
	STRONG_COMPILE_TEST,
	submissionSource,
} from '../../strong-repair';

const TASK = 'octane.strong-sorted-tags';

afterEach(cleanup);

function tags(root: ParentNode): string[] {
	return [...root.querySelectorAll('li')].map((item) => item.textContent!);
}

describe(TASK, () => {
	it(STRONG_COMPILE_TEST, () => {
		expectStrongCompile(submissionSource(TASK));
	});

	it('server-renders the tags alphabetically', () => {
		const container = document.createElement('div');
		container.innerHTML = serverHTML(submissionSource(TASK));
		expect(tags(container)).toEqual(['octane', 'react']);
	});

	it('shows each added tag in alphabetical order', async () => {
		const { App } = await import('@octane-eval-submission/octane.strong-sorted-tags/src/App.tsrx');
		const view = render(App);
		const input = view.container.querySelector('input')!;
		const add = view.container.querySelector('button')!;

		fireEvent.input(input, { target: { value: 'alpha' } });
		fireEvent.click(add);
		expect(tags(view.container)).toEqual(['alpha', 'octane', 'react']);
		expect(input.value).toBe('alpha');

		fireEvent.input(input, { target: { value: 'preact' } });
		fireEvent.click(add);
		expect(tags(view.container)).toEqual(['alpha', 'octane', 'preact', 'react']);
	});
});
