// #2043 step 1: render computes, commit writes. A compiled template's bag holds
// the committed values; a render that may be dropped stages its changes and
// the template's commit function writes them at commit. These pin what the
// DOM, memo bail-outs and event dispatch observe when a render is dropped.
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, flushSync, startTransition } from '../src/index.js';
import { act } from './_helpers';
import {
	CommitCallback,
	CommitError,
	Held,
	HeldDescriptor,
	HeldSpread,
	MemoHeld,
	Nested,
} from './_fixtures/commit-functions.tsrx';

const never = () => new Promise<never>(() => {});
const containers: HTMLElement[] = [];
function host(): HTMLElement {
	const container = document.createElement('div');
	document.body.appendChild(container);
	containers.push(container);
	return container;
}
afterEach(() => {
	for (const container of containers.splice(0)) container.remove();
});

describe('commit functions', () => {
	it('leaves the committed DOM after a dropped transition, and a later urgent update still writes', async () => {
		const container = host();
		const root = createRoot(container);
		const picks: string[] = [];
		const onPick = (label: string) => picks.push(label);
		flushSync(() => root.render(Held, { label: 'committed', wait: null, onPick }));
		const button = container.querySelector('#held') as HTMLButtonElement;

		await act(() =>
			startTransition(() => root.render(Held, { label: 'next', wait: never(), onPick })),
		);
		expect(button.textContent).toBe('committed');
		expect(button.title).toBe('committed');
		expect(button.className).toBe('committed');

		// The dropped render's values never became committed, so the same value
		// arriving urgently still differs from what the DOM shows.
		flushSync(() => root.render(Held, { label: 'next', wait: null, onPick }));
		expect(container.querySelector('#held')).toBe(button);
		expect(button.textContent).toBe('next');
		expect(button.title).toBe('next');
		expect(button.className).toBe('next');
		button.click();
		expect(picks).toEqual(['next']);
		root.unmount();
	});

	it.each([
		{ kind: 'spread', View: HeldSpread },
		{ kind: 'descriptor', View: HeldDescriptor },
	])(
		'leaves a $kind host’s committed props after a dropped transition, and a later urgent update still writes them',
		async ({ kind, View }) => {
			const container = host();
			const root = createRoot(container);
			const log: string[] = [];
			const attrs = (label: string) => ({
				title: label,
				children: label,
				onClick: () => log.push('click:' + label),
				ref: (el: Element | null) => {
					log.push('ref:' + label + ':' + (el === null ? 'null' : el.id));
				},
			});
			flushSync(() =>
				root.render(View, {
					attrs: { ...attrs('committed'), 'data-state': 'committed' },
					wait: null,
				}),
			);
			const button = container.querySelector('#' + kind) as HTMLButtonElement;
			expect(log).toEqual([`ref:committed:${kind}`]);

			await act(() =>
				startTransition(() => root.render(View, { attrs: attrs('next'), wait: never() })),
			);
			expect(button.title).toBe('committed');
			expect(button.getAttribute('data-state')).toBe('committed');
			expect(button.textContent).toBe('committed');
			button.click();
			// The dropped render attached no ref and installed no handler.
			expect(log).toEqual([`ref:committed:${kind}`, 'click:committed']);

			// The same props arriving urgently still differ from what the DOM shows.
			flushSync(() => root.render(View, { attrs: attrs('next'), wait: null }));
			expect(container.querySelector('#' + kind)).toBe(button);
			expect(button.title).toBe('next');
			expect(button.hasAttribute('data-state')).toBe(false);
			expect(button.textContent).toBe('next');
			button.click();
			expect(log).toEqual([
				`ref:committed:${kind}`,
				'click:committed',
				'ref:committed:null',
				`ref:next:${kind}`,
				'click:next',
			]);
			root.unmount();
		},
	);

	it('calls the committed handler for an event during a held transition', async () => {
		const container = host();
		const root = createRoot(container);
		const picks: string[] = [];
		const onPick = (label: string) => picks.push(label);
		flushSync(() => root.render(Held, { label: 'committed', wait: null, onPick }));
		await act(() =>
			startTransition(() => root.render(Held, { label: 'next', wait: never(), onPick })),
		);
		(container.querySelector('#held') as HTMLButtonElement).click();
		expect(picks).toEqual(['committed']);
		root.unmount();
	});

	it('re-renders a memo child after a dropped transition gave it the same props', async () => {
		const container = host();
		const root = createRoot(container);
		flushSync(() => root.render(MemoHeld, { label: 'committed', wait: null }));
		const paragraph = container.querySelector('#memo') as HTMLElement;

		await act(() => startTransition(() => root.render(MemoHeld, { label: 'next', wait: never() })));
		expect(paragraph.textContent).toBe('committed');
		expect(paragraph.title).toBe('committed');

		// The bail-out compares against the committed props, never the dropped ones.
		flushSync(() => root.render(MemoHeld, { label: 'next', wait: null }));
		expect(paragraph.textContent).toBe('next');
		expect(paragraph.title).toBe('next');
		flushSync(() => root.render(MemoHeld, { label: 'committed', wait: null }));
		expect(paragraph.textContent).toBe('committed');
		expect(paragraph.title).toBe('committed');
		root.unmount();
	});

	it('restores an outer window’s pending values when a nested window that rewrote them drops', async () => {
		const container = host();
		const root = createRoot(container);
		const controls = {} as {
			setStep(step: number): void;
			setLocal(local: number): void;
			setSusp(susp: number): void;
		};
		flushSync(() => root.render(Nested, { wait: never(), controls }));
		const row = container.querySelector('#row') as HTMLElement;
		expect(row.textContent).toBe('0:0');

		// The urgent update queues the row in the root window; the transition then
		// re-renders it inside the boundary's window, which drops when its sibling
		// suspends. The row commits the urgent values only.
		await act(() => {
			controls.setStep(1);
			startTransition(() => {
				controls.setLocal(1);
				controls.setSusp(1);
			});
		});
		expect(container.querySelector('#row')).toBe(row);
		expect(row.textContent).toBe('1:0');
		expect(row.title).toBe('title:1:0');
		expect(container.querySelector('#fallback')).toBe(null);
		root.unmount();
	});

	it('finishes a commit whose mutation-phase callback re-renders the same root', async () => {
		if (customElements.get('commit-callback-hook') === undefined) {
			customElements.define(
				'commit-callback-hook',
				class extends HTMLElement {
					static observedAttributes = ['data-value'];
					attributeChangedCallback(_name: string, _previous: string | null, value: string) {
						(this as any).onValue?.(value);
					}
				},
			);
		}
		const container = host();
		const root = createRoot(container);
		const log: string[] = [];
		flushSync(() => root.render(CommitCallback, { value: 'before', tail: 'old', log }));
		const hook = container.querySelector('commit-callback-hook') as HTMLElement & {
			onValue?: (value: string) => void;
		};
		const tail = container.querySelector('#tail')!;
		let tailDuringCallback = '';
		hook.onValue = (value) => {
			if (value !== 'candidate') return;
			hook.onValue = undefined;
			tailDuringCallback = tail.textContent!;
			root.render(CommitCallback, { value: 'newest', tail: 'candidate', log });
		};
		log.length = 0;
		await act(() => root.render(CommitCallback, { value: 'candidate', tail: 'candidate', log }));
		// The callback runs while the commit writes, before the later sibling
		// lands; the commit finishes, with its effects, before the new render.
		expect(tailDuringCallback).toBe('old');
		expect(log).toEqual(['layout:candidate', 'layout:newest']);
		expect(tail.textContent).toBe('candidate');
		expect(hook.getAttribute('data-value')).toBe('newest');
		await act(() => root.render(CommitCallback, { value: 'later', tail: 'later', log }));
		expect(container.querySelector('#tail')).toBe(tail);
		expect(tail.textContent).toBe('later');
		root.unmount();
	});

	it('routes an error thrown while committing to the nearest boundary and commits the rest', () => {
		const container = host();
		const root = createRoot(container);
		flushSync(() => root.render(CommitError, { title: 'one', sibling: 'one' }));
		const throwing = {
			toString() {
				throw new Error('title coercion failed');
			},
		};
		flushSync(() => root.render(CommitError, { title: throwing, sibling: 'two' }));
		expect(container.querySelector('#caught')?.textContent).toBe('title coercion failed');
		const sibling = container.querySelector('#sibling') as HTMLElement;
		expect(sibling.textContent).toBe('two');
		expect(sibling.title).toBe('two');
		root.unmount();
	});
});
