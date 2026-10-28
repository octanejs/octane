import { cleanup, render } from '@octanejs/testing-library';
import { compile } from 'octane/compiler';
import * as signals from 'octane/signals';
import * as clientSignals from 'octane/signals/client';
import { afterEach, describe, expect, it } from 'vitest';
import SignalsGuide from '../src/content/docs/signals.mdx';
import guide from '../src/content/docs/signals.mdx?raw';

const examples = Array.from(guide.matchAll(/^```(ts|tsrx)\n([\s\S]*?)^```$/gm), (match) => {
	const line = guide.slice(0, match.index).split('\n').length + 1;
	return { filename: `signals-line-${line}.${match[1]}`, source: match[2] };
});

describe.each(['client', 'server'] as const)('Signals guide examples (%s)', (mode) => {
	it.for(examples)('$filename compiles without diagnostics', ({ filename, source }) => {
		const result = compile(source, filename, { mode, dev: false });
		expect(result.diagnostics).toEqual([]);
	});
});

afterEach(cleanup);

it('lists importable APIs in the Signals reference table', () => {
	const { container } = render(SignalsGuide);
	const table = container.querySelector('#reference ~ table');
	const names = Array.from(
		table?.querySelectorAll('tbody td:first-child code') ?? [],
		(code) => code.textContent!,
	);
	expect(names.length).toBeGreaterThan(0);
	for (const name of names) {
		const entry = name === 'useSignal$' ? clientSignals : signals;
		expect(Object.hasOwn(entry, name), name).toBe(true);
	}
});
