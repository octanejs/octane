import { expect, it } from 'vitest';
import { useState } from 'octane';
import { query$, type SignalHandle } from 'octane/signals';
import { act, mount } from './_helpers';
import { controlledStream } from './_fixtures/signals-async-controls.js';

type Item = { id: string; text: string } | { id: string; pending: true };

function PendingItem({ label$ }: { label$: SignalHandle<string> }) @{
	const label = label$.get();
	<button>{label as string}</button>
}

function List({ items, label$ }: { items: readonly Item[]; label$: SignalHandle<string> }) @{
	<h3>
		@for (const item of items; key item.id) {
			@if ('text' in item) {
				<>{item.text as string}</>
			} @else {
				<PendingItem label$={label$} />
			}
		}
	</h3>
}

function KeyedSuspenseList(props: {
	initial: readonly Item[];
	replacement: readonly Item[];
	load: () => AsyncIterable<string>;
}) @{
	const [items, setItems] = useState(props.initial);
	const label$ = query$(() => 'label', props.load, { kind: 'stream' });
	<>
		<button id="replace" onClick={() => setItems(props.replacement)}>
			{'Replace'}
		</button>
		@try {
			<List items={items} label$={label$} />
		} @pending {
			<p>{'Loading'}</p>
		}
	</>
}

const empty = { id: 'a', text: '' };
const tail = { id: 'b', text: ' tail' };
const ready = { id: 'ready', text: 'Ready ' };
const pending = { id: 'x', pending: true } as const;

it.each([
	{
		name: 'replacement',
		initial: [empty, tail],
		replacement: [pending, tail],
		expected: 'Button tail',
	},
	{
		name: 'completed insertion and removal',
		initial: [empty, tail],
		replacement: [ready, pending, tail],
		expected: 'Ready Button tail',
	},
	{
		name: 'insertions',
		initial: [tail],
		replacement: [ready, pending, tail],
		expected: 'Ready Button tail',
	},
	{
		name: 'full replacement',
		initial: [empty],
		replacement: [ready, pending, tail],
		expected: 'Ready Button tail',
	},
	{
		name: 'reorder and insertion',
		initial: [empty, tail],
		replacement: [tail, ready, pending, empty],
		expected: ' tailReady Button',
	},
])(
	'reveals keyed rows in order after a suspended $name',
	async ({ initial, replacement, expected }) => {
		const stream = controlledStream<string>();
		const rendered = mount(KeyedSuspenseList, {
			initial,
			replacement,
			load: () => stream.iterable,
		});
		try {
			const retainedTail = Array.from(rendered.find('h3').childNodes).find(
				(node) => node.nodeValue === tail.text,
			);
			expect(retainedTail !== undefined).toBe(initial.includes(tail));
			rendered.click('#replace');
			await act(() => stream.emit('Button'));
			const heading = rendered.find('h3');
			expect(heading.textContent).toBe(expected);
			if (retainedTail) expect(retainedTail.parentNode).toBe(heading);
		} finally {
			rendered.unmount();
			stream.end();
		}
	},
);
