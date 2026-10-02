import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import {
	expectStrongCompile,
	serverHTML,
	STRONG_COMPILE_TEST,
	submissionSource,
} from '../../strong-repair';

const TASK = 'octane.strong-managed-text';

afterEach(cleanup);

describe(TASK, () => {
	it(STRONG_COMPILE_TEST, () => {
		expectStrongCompile(submissionSource(TASK));
	});

	it('server-renders the upper-case name', () => {
		const html = serverHTML(submissionSource(TASK), { name: 'Ada Lovelace' });
		expect(html).toContain('ADA LOVELACE');
		expect(html).toContain('Follow (0)');
	});

	it('keeps the heading and the follow count current on the client', async () => {
		const { App } = await import('@octane-eval-submission/octane.strong-managed-text/src/App.tsrx');
		const view = render(App, { props: { name: 'Ada Lovelace' } });
		const heading = () => view.container.querySelector('h1')!;
		const button = () => view.container.querySelector('button')!;

		expect(heading().textContent).toBe('ADA LOVELACE');
		fireEvent.click(button());
		expect(button().textContent).toBe('Follow (1)');

		view.rerender({ props: { name: 'Grace Hopper' } });
		expect(heading().textContent).toBe('GRACE HOPPER');
		expect(button().textContent).toBe('Follow (1)');
	});
});
