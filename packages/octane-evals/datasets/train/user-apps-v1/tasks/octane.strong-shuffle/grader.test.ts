import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import {
	expectStrongCompile,
	serverHTML,
	STRONG_COMPILE_TEST,
	submissionSource,
} from '../../strong-repair';

const TASK = 'octane.strong-shuffle';
const ANSWERS = ['Red', 'Green', 'Blue', 'Yellow'];

// Alternate low and high values so repeated shuffles produce different orders.
beforeEach(() => {
	let call = 0;
	vi.spyOn(Math, 'random').mockImplementation(() => (call++ % 2 === 0 ? 0.01 : 0.99));
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function answerOrder(root: ParentNode): string[] {
	return [...root.querySelectorAll('ol button')].map((button) => button.textContent!);
}

describe(TASK, () => {
	it(STRONG_COMPILE_TEST, () => {
		expectStrongCompile(submissionSource(TASK));
	});

	it('server-renders the answers in their given order', () => {
		const container = document.createElement('div');
		container.innerHTML = serverHTML(submissionSource(TASK));
		expect(answerOrder(container)).toEqual(ANSWERS);
	});

	it('reorders only when Shuffle is clicked', async () => {
		const { App } = await import('@octane-eval-submission/octane.strong-shuffle/src/App.tsrx');
		const view = render(App);
		const answer = (label: string) =>
			[...view.container.querySelectorAll('ol button')].find(
				(button) => button.textContent === label,
			)!;
		const shuffle = () =>
			[...view.container.querySelectorAll('button')].find(
				(button) => button.textContent === 'Shuffle',
			)!;

		expect(answerOrder(view.container)).toEqual(ANSWERS);
		fireEvent.click(answer('Blue'));
		expect(answer('Blue').getAttribute('aria-pressed')).toBe('true');
		expect(answerOrder(view.container)).toEqual(ANSWERS);

		fireEvent.click(shuffle());
		const shuffled = answerOrder(view.container);
		expect([...shuffled].sort()).toEqual([...ANSWERS].sort());
		expect(shuffled).not.toEqual(ANSWERS);
		fireEvent.click(answer('Red'));
		expect(answerOrder(view.container)).toEqual(shuffled);
		expect(answer('Blue').getAttribute('aria-pressed')).toBe('false');
	});
});
