// The hero's live counter is the running twin of content/home-sample.mdx: its
// effect sits behind `if (!props.paused)`. These drive it the way a reader does.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@octanejs/testing-library';
import { HeroDemo } from '../src/components/HeroDemo.tsrx';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function mountDemo() {
	// The effect mirrors the sample's console.log; capture it (silenced) so tests
	// can assert on it without spraying the runner's output.
	const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
	const utils = render(HeroDemo as any);
	const button = utils.container.querySelector<HTMLButtonElement>('.demo-count')!;
	const count = () => utils.container.querySelector('.demo-count-value')!.textContent!.trim();
	const log = () => utils.container.querySelector('.demo-log')!.textContent!.trim();
	const paused = utils.container.querySelector<HTMLInputElement>('.demo-toggle input')!;
	return { ...utils, button, consoleLog, count, log, paused };
}

describe('hero live counter', () => {
	it('counts up, and the effect reports each new value', async () => {
		const { button, count, log } = mountDemo();

		expect(count()).toBe('0');
		await waitFor(() => expect(log()).toBe('// count is now 0'));

		fireEvent.click(button);
		await waitFor(() => expect(count()).toBe('1'));
		await waitFor(() => expect(log()).toBe('// count is now 1'));
	});

	it('stops running the effect while paused — but the state hook keeps its slot', async () => {
		const { button, count, log, paused } = mountDemo();

		fireEvent.click(button);
		await waitFor(() => expect(log()).toBe('// count is now 1'));

		fireEvent.click(paused);
		await waitFor(() => expect(log()).toBe('// effect skipped'));

		// The conditional effect is gone, but useState below it still counts.
		fireEvent.click(button);
		await waitFor(() => expect(count()).toBe('2'));
		expect(log()).toBe('// effect skipped');

		// Unpausing brings the effect back, and it reports the current count.
		fireEvent.click(paused);
		await waitFor(() => expect(log()).toBe('// count is now 2'));
	});

	it('logs to the console exactly as the sample promises', async () => {
		const { button, consoleLog, count, log, paused } = mountDemo();
		const demoLogs = () =>
			consoleLog.mock.calls.filter((args) => args[0] === 'count is now').map((args) => args[1]);

		await waitFor(() => expect(demoLogs()).toContain(0));

		fireEvent.click(button);
		await waitFor(() => expect(demoLogs()).toContain(1));

		// While paused the effect is skipped entirely — no console output either.
		fireEvent.click(paused);
		await waitFor(() => expect(log()).toBe('// effect skipped'));
		consoleLog.mockClear();
		fireEvent.click(button);
		await waitFor(() => expect(count()).toBe('2'));
		expect(demoLogs()).toEqual([]);
	});
});
