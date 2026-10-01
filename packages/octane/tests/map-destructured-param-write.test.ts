import { describe, expect, it } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import * as Server from 'octane/server';
import { mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import {
	ArrayRows,
	IdentifierRows,
	LetHeaderRows,
	ObjectRows,
} from './_fixtures/map-destructured-param-write.tsrx';

// A native `.map()` callback parameter is an ordinary writable binding, so a
// destructured one must stay assignable after the compiler lowers the map to a
// keyed row loop. The identifier form is the neighbouring control, and an
// authored `@for (let { … } of …)` header shares the same row prologue.
const server = loadServerFixture(
	'packages/octane/tests/_fixtures/map-destructured-param-write.tsrx',
);

const OBJECT_ROWS = [
	{ id: 'a', label: 'Alpha' },
	{ id: 'b', label: 'Beta' },
];
const ARRAY_ROWS: [string, string][] = [
	['a', 'Alpha'],
	['b', 'Beta'],
];

const cases = [
	['object pattern', ObjectRows, 'ObjectRows', OBJECT_ROWS],
	['array pattern', ArrayRows, 'ArrayRows', ARRAY_ROWS],
	['identifier', IdentifierRows, 'IdentifierRows', OBJECT_ROWS],
	['@for let header', LetHeaderRows, 'LetHeaderRows', OBJECT_ROWS],
] as const;

function labels(container: Element): string[] {
	return [...container.querySelectorAll('li')].map((li) => li.textContent ?? '');
}

function clickRow(container: Element, id: string): void {
	const row = container.querySelector(`[data-id="${id}"]`) as HTMLElement;
	flushSync(() => row.click());
}

describe('native .map() callback parameters stay writable', () => {
	it.each(cases)('%s: a row handler reassigns its own binding', (_, Component, __, xs) => {
		const log: string[] = [];
		const view = mount(Component as any, { xs, on: (value: string) => log.push(value) });
		try {
			expect(labels(view.container)).toEqual(['Alpha', 'Beta']);
			clickRow(view.container, 'a');
			clickRow(view.container, 'a');
			clickRow(view.container, 'b');
			expect(log).toEqual(['Alpha!', 'Alpha!!', 'Beta!']);
			// The write is local to the handler's closure and schedules nothing.
			expect(labels(view.container)).toEqual(['Alpha', 'Beta']);
		} finally {
			view.unmount();
		}
	});

	it.each(cases)('%s: server render emits every row', async (_, __, name, xs) => {
		const { html } = await Server.renderToString(server[name], { xs, on: () => {} });
		const container = document.createElement('div');
		container.innerHTML = html;
		expect(labels(container)).toEqual(['Alpha', 'Beta']);
	});

	it.each(cases)(
		'%s: hydrated rows adopt server DOM and accept writes',
		async (_, Component, name, xs) => {
			const { html } = await Server.renderToString(server[name], { xs, on: () => {} });
			const container = document.createElement('div');
			document.body.appendChild(container);
			container.innerHTML = html;
			const serverRows = [...container.querySelectorAll('li')];
			const log: string[] = [];
			const errors: unknown[] = [];
			const root = hydrateRoot(
				container,
				Component as any,
				{ xs, on: (value: string) => log.push(value) },
				{ onRecoverableError: (error: unknown) => errors.push(error) },
			);
			try {
				flushSync(() => {});
				expect(errors).toEqual([]);
				const rows = [...container.querySelectorAll('li')];
				expect(rows).toHaveLength(serverRows.length);
				rows.forEach((row, index) => expect(row).toBe(serverRows[index]));
				clickRow(container, 'b');
				clickRow(container, 'b');
				clickRow(container, 'a');
				expect(log).toEqual(['Beta!', 'Beta!!', 'Alpha!']);
				expect(labels(container)).toEqual(['Alpha', 'Beta']);
			} finally {
				root.unmount();
				container.remove();
			}
		},
	);
});
