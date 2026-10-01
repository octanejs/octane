import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@octanejs/testing-library';
import {
	expectStrongCompile,
	serverHTML,
	STRONG_COMPILE_TEST,
	submissionSource,
} from '../../strong-repair';

const TASK = 'octane.strong-raw-html';
const FIRST = '<p>Fixed <strong>two</strong> bugs.</p>';
const SECOND = '<ul><li>Faster <em>builds</em></li></ul>';

afterEach(cleanup);

describe(TASK, () => {
	it(STRONG_COMPILE_TEST, () => {
		expectStrongCompile(submissionSource(TASK));
	});

	it('server-renders the release notes markup', () => {
		const container = document.createElement('div');
		container.innerHTML = serverHTML(submissionSource(TASK), { html: FIRST });
		expect(container.querySelector('article.release-notes strong')?.textContent).toBe('two');
	});

	it('renders and replaces the markup on the client', async () => {
		const { App } = await import('@octane-eval-submission/octane.strong-raw-html/src/App.tsrx');
		const view = render(App, { props: { html: FIRST } });
		const article = () => view.container.querySelector('article.release-notes')!;

		expect(article().querySelector('strong')?.textContent).toBe('two');
		view.rerender({ props: { html: SECOND } });
		expect(article().querySelector('strong')).toBeNull();
		expect(article().querySelector('li em')?.textContent).toBe('builds');
	});
});
