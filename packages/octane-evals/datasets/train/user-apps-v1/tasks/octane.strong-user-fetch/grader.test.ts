import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@octanejs/testing-library';
import { expectStrongCompile, STRONG_COMPILE_TEST, submissionSource } from '../../strong-repair';

const TASK = 'octane.strong-user-fetch';
const USERS: Record<string, string> = { '1': 'Ada Lovelace', '2': 'Grace Hopper' };
let responses: Map<string, () => void>;

function requestURL(input: RequestInfo | URL): string {
	return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

// Like a real fetch, a request rejects with an AbortError once its signal aborts,
// so a repair that cancels the superseded request is graded on its behavior.
beforeEach(() => {
	responses = new Map();
	vi.stubGlobal(
		'fetch',
		vi.fn(
			(input: RequestInfo | URL, init?: RequestInit) =>
				new Promise((resolve, reject) => {
					const id = requestURL(input).split('/').pop()!;
					const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
					const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
					if (signal?.aborted) return abort();
					signal?.addEventListener('abort', abort, { once: true });
					// A real Response, so a repair may check `ok` or `status` before reading JSON.
					responses.set(id, () =>
						resolve(
							new Response(JSON.stringify({ name: USERS[id] }), {
								headers: { 'Content-Type': 'application/json' },
							}),
						),
					);
				}),
		),
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

async function respond(id: string) {
	await act(async () => {
		responses.get(id)!();
		for (let turn = 0; turn < 5; turn++) await Promise.resolve();
	});
}

describe(TASK, () => {
	it(STRONG_COMPILE_TEST, () => {
		expectStrongCompile(submissionSource(TASK));
	});

	it('loads and shows the requested user', async () => {
		const { App } = await import('@octane-eval-submission/octane.strong-user-fetch/src/App.tsrx');
		const view = render(App, { props: { userId: '1' } });
		expect(view.container.textContent).toBe('Loading…');
		expect(vi.mocked(fetch).mock.calls.map(([input]) => requestURL(input))).toContain(
			'/api/users/1',
		);
		await respond('1');
		expect(view.container.textContent).toBe('Ada Lovelace');
	});

	it('never shows a stale user when an older response arrives last', async () => {
		const { App } = await import('@octane-eval-submission/octane.strong-user-fetch/src/App.tsrx');
		const view = render(App, { props: { userId: '1' } });
		view.rerender({ props: { userId: '2' } });
		await respond('2');
		expect(view.container.textContent).toBe('Grace Hopper');
		await respond('1');
		expect(view.container.textContent).toBe('Grace Hopper');
	});
});
