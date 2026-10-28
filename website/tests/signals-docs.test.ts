import { cleanup, render } from '@octanejs/testing-library';
import { compile } from 'octane/compiler';
import * as streamedSignals from 'octane/hydration/streamed-signals';
import * as signals from 'octane/signals';
import * as clientSignals from 'octane/signals/client';
import * as serverSignals from 'octane/signals/server';
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

it('names the public signals exports in the API reference', () => {
	const { container } = render(SignalsGuide);
	const heading = container.querySelector('h2#reference');
	expect(heading).not.toBeNull();

	const documented = new Set<string>();
	for (
		let node = heading!.nextElementSibling;
		node && node.tagName !== 'H2';
		node = node.nextElementSibling
	) {
		for (const code of node.querySelectorAll(':not(pre) > code')) {
			documented.add(code.textContent ?? '');
		}
	}

	const exported = new Set(
		[signals, clientSignals, serverSignals, streamedSignals].flatMap(Object.keys),
	);
	const missing = [...exported].filter((name) => !name.startsWith('__') && !documented.has(name));
	expect(missing).toEqual([]);
});
