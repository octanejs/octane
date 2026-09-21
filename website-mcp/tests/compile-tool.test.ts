// octane_compile's engine: agents paste source and act on the result, so the
// contract is (a) valid .tsrx compiles to runnable-looking octane output,
// (b) invalid source comes back as a structured diagnostic with a usable
// location — never a throw.
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runCompile } from '../src/mcp/compile-tool.ts';

// Real defineThemeTokens module shared with the compiler's own resolver tests.
const TOKEN_FIXTURE_ROOT = fileURLToPath(
	new URL('../../packages/octane/tests/_fixtures/token-contract', import.meta.url),
);

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
		expect(result.warnings).toEqual([]);
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
		// Message contract pinned by packages/octane/tests/compiler/compile-errors.test.ts.
		const result = runCompile(base(`export async function Foo() @{ <div>{'x'}</div> }`));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.message).toMatch(/declared `async`/);
	});

	it('keeps the thrown diagnostic code so agents can search it', () => {
		// Style analyzer errors throw with `error.code` set; dropping it orphans
		// the diagnostic from the docs table and the analyze --code filter.
		const result = runCompile(
			base(
				`export function C() {\n\treturn <section><style>.a { color: red; }</style><div class="a" /></section>;\n}\n`,
			),
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.code).toBe('tsrx-style-standalone-outside-template');
		expect(result.error.line).toBe(2);
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

	it('returns nonfatal text-event warnings alongside runnable code', () => {
		const result = runCompile(base(`export function Field() @{ <input onChange={() => {}} /> }`));
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.code.length).toBeGreaterThan(0);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toMatchObject({
			code: 'OCTANE_NATIVE_TEXT_ONCHANGE',
			severity: 'warning',
			filename: 'input.tsrx',
		});
	});

	it('does not warn for an explicitly intentional native text commit', () => {
		const result = runCompile(
			base(
				`export function Field() @{ <input onChange={() => {}} suppressNativeChangeWarning /> }`,
			),
		);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.warnings).toEqual([]);
	});

	it('warns unresolved — never silently passes — a claimed contract with no projectRoot', () => {
		// The default filename is relative, so without projectRoot there is no
		// directory to resolve './tokens' against: every candidate claim is
		// unverifiable and must surface as a warning (R5 has no fallback).
		const result = runCompile(
			base(
				`import { tokens } from './tokens';\nexport function Badge() @{\n\t<div>\n\t\t<style>.badge { color: var(--app-colors-primary); }</style>\n\t\t<span class="badge">hi</span>\n\t</div>\n}`,
			),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toMatchObject({
			code: 'octane-style-token-contract-unresolved',
			severity: 'warning',
		});
		expect(result.warnings[0].message).toContain('./tokens');
	});

	it('verifies claimed token references when projectRoot anchors the import', () => {
		const result = runCompile({
			...base(
				`import { tokens } from './tokens';\nexport function Badge() @{\n\t<div>\n\t\t<style>.badge { color: var(--app-colors-primay); }</style>\n\t\t<span class="badge">hi</span>\n\t</div>\n}`,
			),
			projectRoot: TOKEN_FIXTURE_ROOT,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const undeclared = result.warnings.filter(
			(warning) => warning.code === 'octane-style-token-undeclared',
		);
		expect(undeclared).toHaveLength(1);
		expect(undeclared[0].severity).toBe('error');
		expect(undeclared[0].message).toContain('--app-colors-primay');
	});

	it('resolves a contract beside an absolute filename without projectRoot', () => {
		const result = runCompile({
			...base(
				`import { tokens } from './tokens';\nexport function Badge() @{\n\t<div>\n\t\t<style>.badge { color: var(--app-colors-primary); }</style>\n\t\t<span class="badge">hi</span>\n\t</div>\n}`,
			),
			filename: `${TOKEN_FIXTURE_ROOT}/Badge.tsrx`,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.warnings).toEqual([]);
	});
});
