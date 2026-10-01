import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@octanejs/testing-library';
import { expectStrongCompile, STRONG_COMPILE_TEST, submissionSource } from '../../strong-repair';

const TASK = 'octane.strong-user-fetch';
const USERS: Record<string, string> = { '1': 'Ada Lovelace', '2': 'Grace Hopper' };
let responses: Map<string, () => void>;

beforeEach(() => {
	responses = new Map();
	vi.stubGlobal(
		'fetch',
		vi.fn(
			(url: string) =>
				new Promise((resolve) => {
					const id = url.split('/').pop()!;
					responses.set(id, () =>
						resolve({ json: () => Promise.resolve({ name: USERS[id] }) } as Response),
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
		expect(fetch).toHaveBeenCalledWith('/api/users/1');
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
