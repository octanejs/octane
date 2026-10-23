// #2043 step 1: render computes, commit writes. A compiled template's bag holds
// the committed values; a render that may be dropped stages its changes and
// the template's commit function writes them at commit. These pin what the
// DOM, memo bail-outs and event dispatch observe when a render is dropped.
import { afterEach, describe, expect, it } from 'vitest';
import { createElement, createRoot, flushSync, startTransition } from '../src/index.js';
import { act } from './_helpers';
import {
	CommitCallback,
	CommitError,
	Held,
	HeldDescriptor,
	HeldSpread,
	MemoHeld,
	Nested,
	Revert,
	Twins,
} from './_fixtures/commit-functions.tsrx';
import { Item, RevertingRows, TextHoles } from './_fixtures/text-hole-commit.tsrx';
import { HostWrites } from './_fixtures/host-commit.tsrx';

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

	it('commits the committed values when a later render of the transaction reverts a staged row', async () => {
		const container = host();
		const root = createRoot(container);
		const controls = {} as { setStep(step: number): void; setLocal(local: number): void };
		flushSync(() => root.render(Revert, { controls }));
		const row = container.querySelector('#revert') as HTMLElement;
		expect(row.title).toBe('title:0');

		// The urgent render stages the row's new title and text; the transition's
		// render of the same row, in the same drain, computes the committed ones,
		// so it must rewrite the cells the urgent render left pending.
		await act(() => {
			controls.setStep(1);
			startTransition(() => controls.setLocal(1));
		});
		expect(container.querySelector('#revert')).toBe(row);
		expect(row.textContent).toBe('0');
		expect(row.title).toBe('title:0');

		await act(() => controls.setStep(2));
		expect(row.textContent).toBe('1');
		expect(row.title).toBe('title:1');
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

	it('commits each template through its own bag when templates share commit code', async () => {
		const container = host();
		const root = createRoot(container);
		const shown = () =>
			['#twin-title', '#twin-copy', '#twin-class'].map((id) => {
				const el = container.querySelector(id) as HTMLElement;
				return [el.textContent, el.title, el.className];
			});
		flushSync(() => root.render(Twins, { title: 'a', copy: 'b', cls: 'c', wait: null }));
		expect(shown()).toEqual([
			['a', 'a', ''],
			['b', 'b', ''],
			['c', '', 'c'],
		]);

		flushSync(() => root.render(Twins, { title: 'a', copy: 'B', cls: 'c', wait: null }));
		expect(shown()).toEqual([
			['a', 'a', ''],
			['B', 'B', ''],
			['c', '', 'c'],
		]);

		await act(() =>
			startTransition(() => root.render(Twins, { title: 'x', copy: 'y', cls: 'z', wait: never() })),
		);
		expect(shown()).toEqual([
			['a', 'a', ''],
			['B', 'B', ''],
			['c', '', 'c'],
		]);

		flushSync(() => root.render(Twins, { title: 'A', copy: 'B', cls: 'C', wait: null }));
		expect(shown()).toEqual([
			['A', 'A', ''],
			['B', 'B', ''],
			['C', '', 'C'],
		]);
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

describe('renderable holes commit with their render', () => {
	const ITEM = createElement(Item, { label: 'item' });
	const HOST = createElement('i', null, 'host');
	const text = (value: unknown) =>
		value === ITEM
			? 'item'
			: value === HOST
				? 'host'
				: value == null || typeof value === 'boolean'
					? ''
					: String(value);
	// Each hole's position and what it shows for a value's text.
	const positions: Array<[string, (text: string) => string]> = [
		['#sibling', (t) => 'before ' + t + ' after'],
		['#only', (t) => t],
		['#rows li', (t) => t + '|' + t],
		['#pairs .one', (t) => t],
		['#pairs .one-sibling', (t) => 'one' + t],
		['#root-hole', (t) => t],
		['#returned', (t) => t],
	];
	const shown = (container: HTMLElement) =>
		positions.map(([selector]) =>
			[...container.querySelectorAll(selector)].map((node) => node.textContent).join('|'),
		);
	const expected = (value: unknown) => positions.map(([, show]) => show(text(value)));
	// Every change to the container since the last take, named by its kind and
	// the element it changed.
	const observe = (container: HTMLElement) => {
		const records: MutationRecord[] = [];
		const observer = new MutationObserver((batch) => records.push(...batch));
		observer.observe(container, {
			childList: true,
			subtree: true,
			attributes: true,
			characterData: true,
		});
		return {
			take: () =>
				[...records.splice(0), ...observer.takeRecords()].map((record) => {
					const node = record.target;
					const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
					return `${record.type} ${element?.id || element?.className || element?.localName}`;
				}),
			disconnect: () => observer.disconnect(),
		};
	};
	// Text changes, empty text, and switches to and from a component and a host.
	const values = [
		'a',
		'b',
		null,
		'c',
		ITEM,
		'd',
		7,
		true,
		'e',
		ITEM,
		null,
		ITEM,
		HOST,
		'f',
		HOST,
		ITEM,
		HOST,
		null,
		'g',
	];
	type Priority = 'urgent' | 'transition';
	const update = (render: () => void, priority: Priority) =>
		act(() => (priority === 'transition' ? startTransition(render) : render()));

	for (const priority of ['urgent', 'transition'] as const) {
		it(`writes no hole's DOM until its render commits (${priority})`, async () => {
			const container = host();
			const root = createRoot(container);
			let observer: ReturnType<typeof observe> | null = null;
			let during: string[] | null = null;
			const probe = () => {
				if (observer !== null) during = observer.take();
			};
			flushSync(() => root.render(TextHoles, { value: 'start', probe }));
			observer = observe(container);
			try {
				for (const value of values) {
					// The previous commit's changes.
					observer.take();
					during = null;
					await update(() => root.render(TextHoles, { value, probe: () => probe() }), priority);
					// The probe renders after every hole: none had touched the DOM.
					expect(during).toEqual([]);
					expect(shown(container)).toEqual(expected(value));
				}
			} finally {
				observer.disconnect();
				root.unmount();
			}
		});

		it(`leaves every hole untouched when its ${priority} render is dropped, and a later render still writes`, async () => {
			const container = host();
			const root = createRoot(container);
			const probe = () => {};
			for (const committed of ['a', null, ITEM, HOST]) {
				flushSync(() => root.render(TextHoles, { value: committed, probe }));
				for (const value of values) {
					if (value === committed) continue;
					const observer = observe(container);
					// A sibling outside every boundary suspends: the root keeps its screen.
					await update(() => root.render(TextHoles, { value, probe, gate: never() }), priority);
					expect(observer.take()).toEqual([]);
					observer.disconnect();
					expect(shown(container)).toEqual(expected(committed));
				}
				flushSync(() => root.render(TextHoles, { value: 'h', probe }));
				expect(shown(container)).toEqual(expected('h'));
			}
			root.unmount();
		});
	}

	// Production rows guard their holes inline; the dev build always calls the recorder.
	it('commits the value a row hole last rendered when one drain moves it and moves it back', async () => {
		const container = host();
		const root = createRoot(container);
		const controls = { moved: 'b', committed: 'a' } as Parameters<
			typeof RevertingRows
		>[0]['controls'];
		flushSync(() => root.render(RevertingRows, { controls }));
		const rows = () => [...container.querySelectorAll('#reverting li')].map((li) => li.textContent);
		expect(rows()).toEqual(['a', 'a', 'a', 'a']);
		// The transition's render compares each hole against the cell the urgent
		// render staged, not only against the committed value.
		await act(() => controls.move());
		expect(rows()).toEqual(['a', 'a', 'a', 'a']);
		root.unmount();
	});
});

describe('host props, form controls and raw HTML commit with their render', () => {
	const props = (label: string) => ({
		label,
		attrs: { title: label, value: label },
		html: { dangerouslySetInnerHTML: { __html: '<i>' + label + '</i>' } },
	});
	// What each host shows, properties included: a property write leaves no
	// mutation record.
	const shown = (container: HTMLElement) => {
		const input = (id: string) => container.querySelector('#' + id) as HTMLInputElement;
		return [
			input('cascade').title,
			input('cascade').value,
			input('check').checked,
			container.querySelector('#raw')!.innerHTML,
			container.querySelector('#script')!.textContent,
			input('spread-input').title,
			input('spread-input').value,
			input('spread-area').title,
			input('spread-area').value,
			container.querySelector('#spread-raw')!.innerHTML,
		];
	};
	const expected = (label: string) => [
		label,
		label,
		label === 'b',
		'<b>' + label + '</b>',
		'label ' + label,
		label,
		label,
		label,
		label,
		'<i>' + label + '</i>',
	];
	const observe = (container: HTMLElement) => {
		const records: MutationRecord[] = [];
		const observer = new MutationObserver((batch) => records.push(...batch));
		observer.observe(container, {
			childList: true,
			subtree: true,
			attributes: true,
			characterData: true,
		});
		return {
			take: () => [...records.splice(0), ...observer.takeRecords()].map((record) => record.type),
			disconnect: () => observer.disconnect(),
		};
	};
	const labels = ['b', 'c', 'b', 'd'];
	type Priority = 'urgent' | 'transition';
	const update = (render: () => void, priority: Priority) =>
		act(() => (priority === 'transition' ? startTransition(render) : render()));

	for (const priority of ['urgent', 'transition'] as const) {
		it(`writes no host until its render commits (${priority})`, async () => {
			const container = host();
			const root = createRoot(container);
			let observer: ReturnType<typeof observe> | null = null;
			let during: unknown[] | null = null;
			let committed = 'a';
			const probe = () => {
				// The DOM still shows the committed label while the hosts render.
				if (observer !== null) during = [...observer.take(), ...shown(container)];
			};
			flushSync(() => root.render(HostWrites, { ...props(committed), probe }));
			observer = observe(container);
			try {
				for (const label of labels) {
					observer.take();
					during = null;
					await update(
						() => root.render(HostWrites, { ...props(label), probe: () => probe() }),
						priority,
					);
					expect(during).toEqual(expected(committed));
					expect(shown(container)).toEqual(expected(label));
					committed = label;
				}
			} finally {
				observer.disconnect();
				root.unmount();
			}
		});

		it(`leaves every host untouched when its ${priority} render is dropped`, async () => {
			const container = host();
			const root = createRoot(container);
			const probe = () => {};
			flushSync(() => root.render(HostWrites, { ...props('a'), probe }));
			for (const label of labels) {
				const observer = observe(container);
				await update(
					() => root.render(HostWrites, { ...props(label), probe, gate: never() }),
					priority,
				);
				expect(observer.take()).toEqual([]);
				observer.disconnect();
				expect(shown(container)).toEqual(expected('a'));
			}
			flushSync(() => root.render(HostWrites, { ...props('e'), probe }));
			expect(shown(container)).toEqual(expected('e'));
			root.unmount();
		});
	}
});
