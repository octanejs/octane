import { cleanup, render } from '@octanejs/testing-library';
import { compile } from 'octane/compiler';
import * as data from 'octane/data';
import * as octaneBinding from 'octane/data/octane';
import * as server from 'octane/data/server';
import { afterEach, describe, expect, it } from 'vitest';
import reactBinding from '../../packages/octane/src/data/react.ts?raw';
import DataGuide from '../src/content/docs/data.mdx';
import guide from '../src/content/docs/data.mdx?raw';

const examples = Array.from(guide.matchAll(/^```(ts|tsrx)\n([\s\S]*?)^```$/gm), (match) => {
	const line = guide.slice(0, match.index).split('\n').length + 1;
	return { filename: `data-line-${line}.${match[1]}`, source: match[2] };
});

describe.each(['client', 'server'] as const)('Data guide examples (%s)', (mode) => {
	it.for(examples)('$filename compiles without diagnostics', ({ filename, source }) => {
		const result = compile(source, filename, { mode, dev: false });
		expect(result.diagnostics).toEqual([]);
	});
});

afterEach(cleanup);

function referenceNames(container: Element, id: string): string[] {
	const table = container.querySelector(`#${id} ~ table`);
	const names = Array.from(
		table?.querySelectorAll('tbody td:first-child code') ?? [],
		(code) => code.textContent!,
	);
	expect(names.length, id).toBeGreaterThan(0);
	return names;
}

it('lists only real exports in the API reference', () => {
	const { container } = render(DataGuide);
	for (const name of referenceNames(container, 'reference-data')) {
		expect(Object.hasOwn(data, name), name).toBe(true);
	}
	for (const name of referenceNames(container, 'reference-server')) {
		expect(Object.hasOwn(server, name), name).toBe(true);
	}
	for (const name of referenceNames(container, 'reference-bindings')) {
		expect(Object.hasOwn(octaneBinding, name), name).toBe(true);
		expect(reactBinding, name).toMatch(new RegExp(`export function ${name}\\b`));
	}
});

it('documents every runtime export of each entry point', () => {
	const { container } = render(DataGuide);
	const documented = new Set([
		...referenceNames(container, 'reference-data'),
		...referenceNames(container, 'reference-server'),
		...referenceNames(container, 'reference-bindings'),
	]);
	for (const entry of [data, server, octaneBinding]) {
		for (const name of Object.keys(entry)) expect(documented.has(name), name).toBe(true);
	}
});
