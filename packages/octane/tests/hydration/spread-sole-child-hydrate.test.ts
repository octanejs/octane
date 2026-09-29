import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadServerFixture } from '../_server-fixture';
import {
	DirectTextarea,
	SpreadOptionSelect,
	SpreadTernaryTextarea,
	SpreadTextarea,
} from './_fixtures/spread-sole-child.tsrx';

// The client mounts a host's sole renderable `{expr}` child without markers
// whether or not the host has a spread (a spread may carry raw HTML or form
// props, but it does not change the child's shape). The server must emit the
// same shape. Inside a <textarea> (RCDATA) a `<!--[-->…<!--]-->` frame parses
// as part of the default value, which no client claim can unwrap.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/spread-sole-child.tsrx',
);
const server = loadServerFixture(FIXTURE, {
	id: 'spread-sole-child.tsrx',
	compileOptions: { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
});

const containers: HTMLElement[] = [];
afterEach(() => {
	for (const container of containers.splice(0)) container.remove();
	vi.restoreAllMocks();
});

// The React-parity DEV authoring warning for textarea children is not a
// hydration report; it fires for a client-only mount too.
const isTextareaChildrenWarning = (call: unknown[]) =>
	String(call[0]).includes('instead of children on <textarea>');

function renderServer(name: string, props: Record<string, unknown>) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	containers.push(container);
	container.innerHTML = ServerRT.renderToString(server[name], props).html;
	return container;
}

function hydrate(container: HTMLElement, component: any, props: Record<string, unknown>) {
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const recoverable: unknown[] = [];
	const root = hydrateRoot(container, component, props, {
		onRecoverableError: (error) => recoverable.push(error),
	});
	return {
		root,
		recoverable,
		reports: () => errors.mock.calls.filter((call) => !isTextareaChildrenWarning(call)),
	};
}

const VALUES = [
	{ label: 'a string', value: 'A', expected: 'A' },
	{ label: 'escaped text', value: 'a & <b>', expected: 'a & <b>' },
	{ label: 'multiline text', value: 'one\ntwo', expected: 'one\ntwo' },
	{ label: 'a leading newline', value: '\nA', expected: '\nA' },
	{ label: 'a number', value: 7, expected: '7' },
	{ label: 'zero', value: 0, expected: '0' },
	{ label: 'an empty string', value: '', expected: '' },
	{ label: 'null', value: null, expected: '' },
	{ label: 'false', value: false, expected: '' },
];

describe('hydrateRoot: sole renderable child of a textarea', () => {
	const COMPONENTS = [
		{ name: 'SpreadTextarea', client: SpreadTextarea, rest: { name: 'body', rows: 3 } },
		{ name: 'SpreadTextarea', client: SpreadTextarea, rest: {} },
		{ name: 'DirectTextarea', client: DirectTextarea, rest: undefined },
	] as const;

	it.each(
		COMPONENTS.flatMap((component) =>
			VALUES.map((value) => ({
				...value,
				component,
				case: `${component.name}(${JSON.stringify(component.rest)}) with ${value.label}`,
			})),
		),
	)('serializes plain text and adopts it: $case', async ({ component, value, expected }) => {
		const props = { value, rest: component.rest };
		const container = renderServer(component.name, props);

		// Before any script runs, the parsed textarea holds exactly the value text.
		const textarea = container.querySelector('textarea')!;
		expect(textarea.defaultValue).toBe(expected);
		expect(textarea.value).toBe(expected);
		if (component.rest?.name) expect(textarea.getAttribute('name')).toBe('body');

		const { root, recoverable, reports } = hydrate(container, component.client, props);
		try {
			await act(() => {});
			expect(recoverable).toEqual([]);
			expect(reports()).toEqual([]);
			expect(container.querySelector('textarea')).toBe(textarea);
			expect(textarea.defaultValue).toBe(expected);
			expect(textarea.value).toBe(expected);

			// The adopted child stays a live text binding.
			flushSync(() => root.render(component.client, { ...props, value: 'Updated' }));
			expect(container.querySelector('textarea')).toBe(textarea);
			expect(textarea.defaultValue).toBe('Updated');
			expect(textarea.value).toBe('Updated');
		} finally {
			root.unmount();
		}
	});

	it.each([
		{ on: true, value: 'chosen', expected: 'chosen' },
		{ on: true, value: null, expected: '' },
		{ on: false, value: 'chosen', expected: 'fallback' },
	])('serializes a ternary child as plain text (on=$on, value=$value)', async (input) => {
		const props = { on: input.on, value: input.value, rest: { name: 'body' } };
		const container = renderServer('SpreadTernaryTextarea', props);
		const textarea = container.querySelector('textarea')!;
		expect(textarea.defaultValue).toBe(input.expected);

		const { root, recoverable, reports } = hydrate(container, SpreadTernaryTextarea, props);
		try {
			await act(() => {});
			expect(recoverable).toEqual([]);
			expect(reports()).toEqual([]);
			expect(container.querySelector('textarea')).toBe(textarea);
			expect(textarea.value).toBe(input.expected);
		} finally {
			root.unmount();
		}
	});
});

describe('hydrateRoot: sole renderable child of a spread option', () => {
	it('selects the option whose label matches before and after hydration', async () => {
		const props = { selected: 'Beta', first: 'Alpha', second: 'Beta', rest: { className: 'opt' } };
		const container = renderServer('SpreadOptionSelect', props);
		const select = container.querySelector('select')!;
		const options = Array.from(select.options);
		expect(options.map((option) => option.defaultSelected)).toEqual([false, true]);
		expect(select.value).toBe('Beta');

		const { root, recoverable, reports } = hydrate(container, SpreadOptionSelect, props);
		try {
			await act(() => {});
			expect(recoverable).toEqual([]);
			expect(reports()).toEqual([]);
			expect(Array.from(select.options)).toEqual(options);
			expect(options.map((option) => option.text)).toEqual(['Alpha', 'Beta']);
			expect(select.value).toBe('Beta');
		} finally {
			root.unmount();
		}
	});
});
