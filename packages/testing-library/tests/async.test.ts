/**
 * Async utilities — ports of react-testing-library@be9d81d
 * src/__tests__/end-to-end.js (real-timer slice) plus a Suspense reveal, all
 * through dom-testing-library's `waitFor`/`findBy*` (re-exported verbatim; the
 * octane wiring under test is the `asyncWrapper` act-environment suspension).
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
	render,
	cleanup,
	screen,
	waitFor,
	waitForElementToBeRemoved,
} from '@octanejs/testing-library';
import { Loader, SuspenseHost } from './_fixtures/async.tsrx';

afterEach(cleanup);

const loadMessage = () =>
	new Promise<string>((resolve) => setTimeout(() => resolve('Hello World'), 30));

describe('end-to-end async data flow', () => {
	// Per react-testing-library src/__tests__/end-to-end.js:55 ("waitForElementToBeRemoved")
	it('waitForElementToBeRemoved sees the loading state go away', async () => {
		render(Loader, { props: { load: loadMessage } });
		await waitForElementToBeRemoved(() => screen.queryByText('Loading...'));
		expect(screen.getByTestId('message').textContent).toMatch(/Hello World/);
	});

	// Per end-to-end.js:62 ("waitFor")
	it('waitFor polls until the loaded message commits', async () => {
		render(Loader, { props: { load: loadMessage } });
		await waitFor(() => {
			expect(screen.getByText(/Loaded this message:/)).toBeTruthy();
		});
		expect(screen.getByTestId('message').textContent).toBe('Loaded this message: Hello World');
	});

	// Per end-to-end.js:69 ("findBy")
	it('findByTestId resolves once the async update lands', async () => {
		render(Loader, { props: { load: loadMessage } });
		const message = await screen.findByTestId('message');
		expect(message.textContent).toBe('Loaded this message: Hello World');
	});
});

describe('suspense', () => {
	it('shows the fallback, then reveals via findBy once the promise resolves', async () => {
		let resolve!: (v: string) => void;
		const promise = new Promise<string>((r) => {
			resolve = r;
		});
		render(SuspenseHost, { props: { promise } });
		expect(screen.getByText('loading')).toBeTruthy();
		expect(screen.queryByTestId('content')).toBeNull();

		resolve('revealed');
		const content = await screen.findByTestId('content');
		expect(content.textContent).toBe('revealed');
		expect(screen.queryByText('loading')).toBeNull();
	});
});
