import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import {
	expectStrongCompile,
	serverHTML,
	STRONG_COMPILE_TEST,
	submissionSource,
} from '../../strong-repair';

const TASK = 'octane.strong-random-id';

afterEach(cleanup);

describe(TASK, () => {
	it(STRONG_COMPILE_TEST, () => {
		expectStrongCompile(submissionSource(TASK));
	});

	it('server-renders the same labelled field every time', () => {
		const source = submissionSource(TASK);
		const first = serverHTML(source);
		expect(serverHTML(source)).toBe(first);
		const container = document.createElement('div');
		container.innerHTML = first;
		const input = container.querySelector('input')!;
		expect(input.id).not.toBe('');
		expect(container.querySelector('label')!.htmlFor).toBe(input.id);
	});

	it('keeps a stable, distinct ID per form while typing', async () => {
		const { App } = await import('@octane-eval-submission/octane.strong-random-id/src/App.tsrx');
		const first = render(App);
		const second = render(App);
		const input = first.container.querySelector('input')!;
		const id = input.id;

		expect(id).not.toBe('');
		expect(second.container.querySelector('input')!.id).not.toBe(id);
		fireEvent.input(input, { target: { value: 'ada@example.com' } });
		expect(first.container.textContent).toContain('We will write to ada@example.com');
		expect(first.container.querySelector('input')!.id).toBe(id);
		expect(first.container.querySelector('label')!.htmlFor).toBe(id);
	});
});
