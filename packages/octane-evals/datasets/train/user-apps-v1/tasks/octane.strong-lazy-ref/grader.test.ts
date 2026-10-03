import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import {
	expectStrongCompile,
	serverHTML,
	STRONG_COMPILE_TEST,
	submissionSource,
} from '../../strong-repair';

const TASK = 'octane.strong-lazy-ref';

afterEach(cleanup);

// Counts every history the editor builds. Each one has the `size`, `push`, and
// `pop` members the prompt specifies.
function historyFactory() {
	let built = 0;
	const createHistory = () => {
		built += 1;
		const versions: string[] = [];
		return {
			get size() {
				return versions.length;
			},
			push(text: string) {
				versions.push(text);
			},
			pop() {
				return versions.pop();
			},
		};
	};
	return { createHistory, built: () => built };
}

function editor(root: ParentNode) {
	const draft = root.querySelector('textarea')!;
	const undo = [...root.querySelectorAll('button')].find(
		(button) => button.textContent === 'Undo',
	)!;
	return {
		draft,
		undo,
		type: (value: string) => fireEvent.input(draft, { target: { value } }),
	};
}

describe(TASK, () => {
	it(STRONG_COMPILE_TEST, () => {
		expectStrongCompile(submissionSource(TASK));
	});

	it('server-renders an empty draft with Undo disabled', () => {
		const source = submissionSource(TASK);
		const { createHistory, built } = historyFactory();
		const container = document.createElement('div');
		container.innerHTML = serverHTML(source, { createHistory });
		const { draft, undo } = editor(container);

		expect(draft.value).toBe('');
		expect(undo.disabled).toBe(true);
		expect(built()).toBeLessThanOrEqual(1);
		container.innerHTML = serverHTML(source);
		expect(editor(container).undo.disabled).toBe(true);
	});

	it('builds one history per editor and keeps it across re-renders', async () => {
		const { App } = await import('@octane-eval-submission/octane.strong-lazy-ref/src/App.tsrx');
		const { createHistory, built } = historyFactory();
		const view = render(App, { props: { createHistory } });
		const { draft, undo, type } = editor(view.container);

		expect(built()).toBeLessThanOrEqual(1);
		expect(undo.disabled).toBe(true);
		type('D');
		type('Dr');
		type('Dra');
		// A parent that re-renders passes a new factory function; the editor keeps
		// the history it already has.
		view.rerender({ props: { createHistory: () => createHistory() } });
		type('Draf');
		expect(built()).toBe(1);

		fireEvent.click(undo);
		expect(draft.value).toBe('Dra');
		fireEvent.click(undo);
		fireEvent.click(undo);
		expect(draft.value).toBe('D');
		fireEvent.click(undo);
		expect(draft.value).toBe('');
		expect(undo.disabled).toBe(true);
		expect(built()).toBe(1);
	});

	it('gives every mounted editor its own history', async () => {
		const { App } = await import('@octane-eval-submission/octane.strong-lazy-ref/src/App.tsrx');
		const { createHistory, built } = historyFactory();
		const first = render(App, { props: { createHistory } });
		const second = render(App, { props: { createHistory } });
		const a = editor(first.container);
		const b = editor(second.container);

		a.type('Apples');
		expect(b.undo.disabled).toBe(true);
		b.type('Pears');
		b.type('Pears!');
		fireEvent.click(a.undo);
		expect(a.draft.value).toBe('');
		expect(b.draft.value).toBe('Pears!');
		fireEvent.click(b.undo);
		expect(b.draft.value).toBe('Pears');
		expect(built()).toBe(2);

		second.unmount();
		const again = editor(render(App, { props: { createHistory } }).container);
		expect(again.undo.disabled).toBe(true);
		again.type('Plums');
		fireEvent.click(again.undo);
		expect(again.draft.value).toBe('');
		expect(built()).toBe(3);
	});
});
