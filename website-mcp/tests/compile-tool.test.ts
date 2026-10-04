// octane_compile's engine: agents paste source and act on the result, so the
// contract is (a) valid .tsrx compiles to runnable-looking octane output,
// (b) invalid source comes back as a structured diagnostic with a usable
// location — never a throw.
import { describe, expect, it } from 'vitest';
import { runCompile, type StrongFinding } from '../src/mcp/compile-tool.ts';

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
});

// A clock and a random draw in one render: two findings of the same code at
// two positions.
const IMPURE = `export function Stamp() {
	const now = Date.now();
	const roll = Math.random();
	return <span>{String(now + roll)}</span>;
}
`;

const LAZY_REF = `import { useRef } from 'octane';

export function Cart() {
	const store = useRef<Map<string, number> | null>(null);
	if (store.current === null) store.current = new Map();
	return <button onClick={() => store.current?.clear()}>Clear</button>;
}
`;

function applyEdits(source: string, edits: Array<{ start: number; end: number; text: string }>) {
	let text = source;
	for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
		text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
	}
	return text;
}

describe('runCompile in Strong mode', () => {
	it('reports every Strong finding, not only the first error', () => {
		const result = runCompile({ ...base(IMPURE), filename: 'input.tsx', strong: true });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		// The error compilation stopped at keeps its existing shape, now with
		// its code and docs entry.
		expect(result.error.code).toBe('OCTANE_STRONG_RENDER_IMPURE_CALL');
		expect(result.error.url).toBe(
			'https://octanejs.dev/docs/strong-mode#octane-strong-render-impure-call',
		);
		expect(result.error.line).toBe(2);

		const findings = result.diagnostics ?? [];
		expect(findings.map((finding) => [finding.code, finding.start.line])).toEqual([
			['OCTANE_STRONG_RENDER_IMPURE_CALL', 2],
			['OCTANE_STRONG_RENDER_IMPURE_CALL', 3],
		]);
		const [clock, roll] = findings;
		expect(IMPURE.slice(clock.start.offset, clock.end.offset)).toMatch(/^Date\.now/);
		expect(IMPURE.slice(roll.start.offset, roll.end.offset)).toMatch(/^Math\.random/);
		for (const finding of findings) {
			expect(finding.severity).toBe('error');
			expect(finding.url).toBe(result.error.url);
			expect(finding.frame).toContain('^');
		}
	});

	it('applies Strong mode to a module with the directive without the option', () => {
		const result = runCompile({
			...base(`"use strong";\n${IMPURE}`),
			filename: 'input.tsx',
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.diagnostics?.map((finding) => finding.start.line)).toEqual([3, 4]);
	});

	it('carries source edits that rewrite the lazy ref idiom to useLazyRef', () => {
		const result = runCompile({ ...base(LAZY_REF), filename: 'input.tsx', strong: true });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		const findings = result.diagnostics ?? [];
		expect(findings.map((finding) => finding.code).sort()).toEqual([
			'OCTANE_STRONG_RENDER_REF_READ',
			'OCTANE_STRONG_RENDER_REF_WRITE',
		]);
		for (const finding of findings) {
			expect(finding.url).toMatch(
				/^https:\/\/octanejs\.dev\/docs\/strong-mode#octane-strong-render-ref-/,
			);
		}
		const suggestions = findings.flatMap((finding: StrongFinding) => finding.suggestions);
		const withEdits = suggestions.filter((suggestion) => 'edits' in suggestion && suggestion.edits);
		expect(withEdits).toHaveLength(1);
		const [fix] = withEdits;
		if (!('edits' in fix) || !fix.edits) return;
		expect(fix.hook).toBe('useLazyRef');
		expect(fix.message).toContain('useLazyRef');

		// The edits are offsets into the pasted source; applied, they compile.
		const fixed = applyEdits(LAZY_REF, fix.edits);
		expect(fixed).toContain('useLazyRef(() => new Map())');
		expect(fixed).not.toContain('store.current === null');
		const recompiled = runCompile({ ...base(fixed), filename: 'input.tsx', strong: true });
		expect(recompiled.ok).toBe(true);
	});

	it('links Strong hints on a successful compile to their docs entries', () => {
		const result = runCompile({
			...base(`import { useEffect } from 'octane';
export function Title({ text }: { text: string }) {
	useEffect(() => {
		document.title = text;
	}, [text]);
	return <h1>{text}</h1>;
}
`),
			filename: 'input.tsx',
			strong: true,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.code.length).toBeGreaterThan(0);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toMatchObject({
			code: 'OCTANE_STRONG_EXPLICIT_DEPENDENCIES',
			severity: 'hint',
			url: 'https://octanejs.dev/docs/strong-mode#octane-strong-explicit-dependencies',
		});
	});

	it('keeps a non-Strong failure as a single located error', () => {
		const result = runCompile({
			...base(`export function Broken() @{\n\t<div>\n}\n`),
			strong: true,
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(typeof result.error.line).toBe('number');
		expect(result.diagnostics).toEqual([]);
	});

	it('leaves compatibility-mode output unchanged', () => {
		const result = runCompile({ ...base(IMPURE), filename: 'input.tsx' });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.warnings).toEqual([]);
		expect('diagnostics' in result).toBe(false);
	});
});
