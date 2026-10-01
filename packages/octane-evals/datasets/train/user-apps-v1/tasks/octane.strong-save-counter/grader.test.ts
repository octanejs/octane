import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render } from '@octanejs/testing-library';
import {
	expectStrongCompile,
	serverHTML,
	STRONG_COMPILE_TEST,
	submissionSource,
} from '../../strong-repair';

const TASK = 'octane.strong-save-counter';

afterEach(cleanup);

function deferredSaves() {
	const pending: Array<() => void> = [];
	const save = () => new Promise<void>((resolve) => pending.push(resolve));
	return { save, pending };
}

async function settle(resolve: () => void) {
	await act(async () => {
		resolve();
		for (let turn = 0; turn < 5; turn++) await Promise.resolve();
	});
}

describe(TASK, () => {
	it(STRONG_COMPILE_TEST, () => {
		expectStrongCompile(submissionSource(TASK));
	});

	it('server-renders the initial count', () => {
		expect(serverHTML(submissionSource(TASK), { save: async () => {} })).toContain('Saved 0 times');
	});

	it('counts every completed save, including overlapping ones', async () => {
		const { App } = await import('@octane-eval-submission/octane.strong-save-counter/src/App.tsrx');
		const { save, pending } = deferredSaves();
		const view = render(App, { props: { save } });
		const button = view.container.querySelector('button')!;

		fireEvent.click(button);
		fireEvent.click(button);
		expect(pending).toHaveLength(2);
		await settle(pending[0]);
		await settle(pending[1]);
		expect(view.container.querySelector('p')!.textContent).toBe('Saved 2 times');

		fireEvent.click(button);
		await settle(pending[2]);
		expect(view.container.querySelector('p')!.textContent).toBe('Saved 3 times');
	});
});
