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
	const logLines = () =>
		Array.from(utils.container.querySelectorAll('.demo-terminal-line')).map((line) =>
			line.textContent!.trim(),
		);
	const terminal = utils.container.querySelector<HTMLElement>('.demo-terminal-body')!;
	const terminalStatus = () =>
		utils.container.querySelector('.demo-terminal-status')!.textContent!.trim();
	const jumpToLatest = () =>
		utils.container.querySelector<HTMLButtonElement>('.demo-terminal-jump');
	const paused = utils.container.querySelector<HTMLInputElement>('.demo-toggle input')!;
	return {
		...utils,
		button,
		consoleLog,
		count,
		jumpToLatest,
		logLines,
		paused,
		terminal,
		terminalStatus,
	};
}

describe('hero live counter', () => {
	it('appends each effect result to a terminal history', async () => {
		const { button, count, logLines } = mountDemo();

		expect(count()).toBe('0');
		await waitFor(() => expect(logLines()).toEqual(['›count is now 0']));

		fireEvent.click(button);
		await waitFor(() => expect(count()).toBe('1'));
		await waitFor(() => expect(logLines()).toEqual(['›count is now 0', '›count is now 1']));
	});

	it('preserves the last output while the effect is paused and catches up when resumed', async () => {
		const { button, count, logLines, paused, terminalStatus } = mountDemo();

		fireEvent.click(button);
		await waitFor(() => expect(logLines().at(-1)).toBe('›count is now 1'));

		fireEvent.click(paused);
		await waitFor(() => expect(terminalStatus()).toBe('Effect paused'));

		// The conditional effect is gone, but useState below it still counts.
		fireEvent.click(button);
		await waitFor(() => expect(count()).toBe('2'));
		expect(logLines().at(-1)).toBe('›count is now 1');

		// Unpausing brings the effect back, and it reports the current count.
		fireEvent.click(paused);
		await waitFor(() => expect(terminalStatus()).toBe('Effect active'));
		await waitFor(() => expect(logLines().at(-1)).toBe('›count is now 2'));
	});

	it('logs to the console exactly as the sample promises', async () => {
		const { button, consoleLog, count, logLines, paused } = mountDemo();
		const demoLogs = () =>
			consoleLog.mock.calls.filter((args) => args[0] === 'count is now').map((args) => args[1]);

		await waitFor(() => expect(demoLogs()).toContain(0));

		fireEvent.click(button);
		await waitFor(() => expect(demoLogs()).toContain(1));

		// While paused the effect is skipped entirely — no console output either.
		fireEvent.click(paused);
		await waitFor(() => expect(logLines().at(-1)).toBe('›count is now 1'));
		consoleLog.mockClear();
		fireEvent.click(button);
		await waitFor(() => expect(count()).toBe('2'));
		expect(demoLogs()).toEqual([]);
	});

	it('returns to the latest output when Count or Latest is clicked', async () => {
		const { button, jumpToLatest, logLines, terminal } = mountDemo();

		await waitFor(() => expect(logLines().at(-1)).toBe('›count is now 0'));
		Object.defineProperties(terminal, {
			clientHeight: { configurable: true, value: 80 },
			scrollHeight: { configurable: true, value: 240 },
			scrollTop: { configurable: true, value: 0, writable: true },
		});

		fireEvent.click(button);
		await waitFor(() => expect(terminal.scrollTop).toBe(240));

		terminal.scrollTop = 40;
		fireEvent.scroll(terminal);
		await waitFor(() => expect(jumpToLatest()).toBeTruthy());

		fireEvent.click(button);
		await waitFor(() => expect(logLines().at(-1)).toBe('›count is now 2'));
		expect(terminal.scrollTop).toBe(240);
		expect(jumpToLatest()).toBeNull();

		terminal.scrollTop = 40;
		fireEvent.scroll(terminal);
		await waitFor(() => expect(jumpToLatest()).toBeTruthy());
		fireEvent.click(jumpToLatest()!);
		expect(terminal.scrollTop).toBe(240);
		expect(jumpToLatest()).toBeNull();
	});

	it('bounds the retained terminal history', async () => {
		const { button, count, logLines } = mountDemo();

		await waitFor(() => expect(logLines().at(-1)).toBe('›count is now 0'));
		for (let value = 1; value <= 55; value++) fireEvent.click(button);

		await waitFor(() => expect(count()).toBe('55'));
		await waitFor(() => expect(logLines().at(-1)).toBe('›count is now 55'));
		expect(logLines()).toHaveLength(50);
		expect(logLines()[0]).toBe('›count is now 6');
	});
});
