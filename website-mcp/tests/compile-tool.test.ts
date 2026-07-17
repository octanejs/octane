// octane_compile's engine: agents paste source and act on the result, so the
// contract is (a) valid .tsrx compiles to runnable-looking octane output,
// (b) invalid source comes back as a structured diagnostic with a usable
// location — never a throw.
import { describe, expect, it } from 'vitest';
import { runCompile } from '../src/mcp/compile-tool.ts';

const COUNTER = `
import { useState } from 'octane';

export function Counter() @{
	const [count, setCount] = useState(0);
	<button onClick={() => setCount(count + 1)}>{'Count: ' + count}</button>
}
`;

function base(source: string) {
	return { source, filename: 'input.tsrx', mode: 'client' as const, dev: false };
}

describe('runCompile', () => {
	it('compiles a valid .tsrx component', () => {
		const result = runCompile(base(COUNTER));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.code).toContain('Counter');
		// The directive shorthand never survives compilation.
		expect(result.code).not.toContain('@{');
		expect(result.octaneVersion).toMatch(/^\d+\.\d+\.\d+/);
	});

	it('server mode produces different output than client mode', () => {
		const client = runCompile(base(COUNTER));
		const server = runCompile({ ...base(COUNTER), mode: 'server' });
		expect(client.ok && server.ok).toBe(true);
		if (!client.ok || !server.ok) return;
		expect(server.code).not.toBe(client.code);
	});

	it('reports an async component as a diagnostic with the maintained message', () => {
		// Message contract pinned by packages/octane/tests/compile-errors.test.ts.
		const result = runCompile(base(`export async function Foo() @{ <div>{'x'}</div> }`));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.message).toMatch(/declared `async`/);
	});

	it('locates a parse error with line, column, and a caret frame', () => {
		const result = runCompile(
			base(`export function Broken() @{\n\t<div>\n}\n`), // unclosed <div>
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(typeof result.error.line).toBe('number');
		expect(typeof result.error.column).toBe('number');
		expect(result.error.frame).toContain('^');
	});

	it('compiles standard .tsx without tsrx directives', () => {
		const result = runCompile({
			...base(`export function Plain() { return <div>{'hi'}</div>; }`),
			filename: 'input.tsx',
		});
		expect(result.ok).toBe(true);
	});
});
