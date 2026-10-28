import { compile } from 'octane/compiler';
import { describe, expect, it } from 'vitest';
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
