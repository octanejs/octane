import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import {
	expectStrongCompile,
	serverHTML,
	STRONG_COMPILE_TEST,
	submissionSource,
} from '../../strong-repair';

const TASK = 'octane.strong-row-keys';

afterEach(cleanup);

describe(TASK, () => {
	it(STRONG_COMPILE_TEST, () => {
		expectStrongCompile(submissionSource(TASK));
	});

	it('server-renders both tasks collapsed', () => {
		const html = serverHTML(submissionSource(TASK));
		expect(html).toContain('Write docs');
		expect(html).toContain('Review PR');
		expect(html).not.toContain('Details for');
	});

	it('keeps each row open state with its task across updates', async () => {
		const { App } = await import('@octane-eval-submission/octane.strong-row-keys/src/App.tsrx');
		const view = render(App);
		const row = (title: string) =>
			[...view.container.querySelectorAll('li')].find(
				(item) => item.querySelector('button')?.textContent === title,
			)!;
		const addTask = () =>
			[...view.container.querySelectorAll('button')].find(
				(button) => button.textContent === 'Add task',
			)!;

		fireEvent.click(row('Review PR').querySelector('button')!);
		expect(row('Review PR').textContent).toContain('Details for Review PR');

		fireEvent.click(addTask());
		expect(row('New task 3')).toBeDefined();
		expect(row('New task 3').textContent).not.toContain('Details for');
		expect(row('Review PR').textContent).toContain('Details for Review PR');
		expect(row('Write docs').textContent).not.toContain('Details for');
	});
});
