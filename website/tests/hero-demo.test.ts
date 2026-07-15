// The hero's live counter is the running twin of content/home-sample.mdx: its
// effect sits behind `if (!props.paused)`. These drive it the way a reader does.
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@octanejs/testing-library';
import { HeroDemo } from '../src/components/HeroDemo.tsrx';

afterEach(cleanup);

function mountDemo() {
	const utils = render(HeroDemo as any);
	const button = utils.container.querySelector<HTMLButtonElement>('.demo-count')!;
	const count = () => utils.container.querySelector('.demo-count-value')!.textContent!.trim();
	const log = () => utils.container.querySelector('.demo-log')!.textContent!.trim();
	const paused = utils.container.querySelector<HTMLInputElement>('.demo-toggle input')!;
	return { ...utils, button, count, log, paused };
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
});
