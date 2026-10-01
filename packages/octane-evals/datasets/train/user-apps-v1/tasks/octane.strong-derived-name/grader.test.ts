import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@octanejs/testing-library';
import {
	expectStrongCompile,
	serverHTML,
	STRONG_COMPILE_TEST,
	submissionSource,
} from '../../strong-repair';

const TASK = 'octane.strong-derived-name';

afterEach(cleanup);

describe(TASK, () => {
	it(STRONG_COMPILE_TEST, () => {
		expectStrongCompile(submissionSource(TASK));
	});

	it('server-renders the full name', () => {
		expect(serverHTML(submissionSource(TASK), { first: 'Ada', last: 'Lovelace' })).toContain(
			'Signed in as Ada Lovelace',
		);
	});

	it('shows the full name in the same render that receives new props', async () => {
		const { App } = await import('@octane-eval-submission/octane.strong-derived-name/src/App.tsrx');
		const view = render(App, { props: { first: 'Ada', last: 'Lovelace' } });
		expect(view.container.textContent).toBe('Signed in as Ada Lovelace');
		view.rerender({ props: { first: 'Grace', last: 'Hopper' } });
		expect(view.container.textContent).toBe('Signed in as Grace Hopper');
	});
});
