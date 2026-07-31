import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { compile, compileToVolarMappings } from 'octane/compiler';

// Parser-AST immutability: the compile pipeline must never mutate the module
// AST it receives from parseModule/analyzeTsrx — rewrites operate on a
// compiler-owned clone (see adoptParserAst in compile.js). Enforced here by
// OCTANE_COMPILE_FROZEN_AST=1: every adopted parser AST is deep-frozen, so any
// in-place write throws a TypeError naming the offending line. This invariant
// is what makes authored `loc` data trustworthy for source mapping and lets a
// single parse be shared safely across analysis and compile modes.
//
// The fixture is deliberately feature-dense so the freeze walks the paths that
// historically mutated in place: type-only statements (dropped), arrow
// components (normalized), scoped styles (restamped/hashed), hooks with
// inferred deps, events, directive control flow, and spreads.
const SOURCE = `
import { useState, useEffect, useMemo } from 'octane';
import type { OctaneNode } from 'octane';

interface RowData {
	id: number;
	label: string;
}

type Onto = RowData | null;

const Title = () => @{
	<h2 class="title">Static title</h2>
}

function Row(props: { row: RowData; onPick: (id: number) => void }) @{
	<li onClick={() => props.onPick(props.row.id)}>{props.row.label}</li>
}

export function App() @{
	const [rows, setRows] = useState<RowData[]>([]);
	const [query, setQuery] = useState('');
	const visible = useMemo(() => rows.filter((r) => r.label.includes(query)));
	useEffect(() => {
		setRows([{ id: 1, label: 'one' }]);
	});
	const extra = { 'data-kind': 'list' };
	<div class={['list', { empty: visible.length === 0 }]} {...extra}>
		<style>
			div {
				color: rgb(10, 20, 30);
			}
		</style>
		<Title />
		<input value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
		@if (visible.length > 0) {
			<ul>
				@for (const row of visible; key row.id) {
					<Row row={row} onPick={(id) => setRows(rows.filter((r) => r.id !== id))} />
				} @empty {
					<li>Empty</li>
				}
			</ul>
		} @else {
			<p>{'No rows for: ' + query}</p>
		}
	</div>
}
`;

const FILENAME = 'ast-immutability.tsrx';

const MODES: Array<[string, Record<string, unknown>]> = [
	['client (default)', {}],
	['client dev', { dev: true }],
	['client hmr:vite', { hmr: 'vite', dev: true }],
	['client production', { hmr: false }],
	['client profile', { hmr: false, profile: true }],
	['server', { mode: 'server' }],
	['server dev', { mode: 'server', dev: true }],
];

describe('compiler parser-AST immutability (frozen-AST enforcement)', () => {
	const previous = process.env.OCTANE_COMPILE_FROZEN_AST;
	beforeAll(() => {
		process.env.OCTANE_COMPILE_FROZEN_AST = '1';
	});
	afterAll(() => {
		if (previous === undefined) delete process.env.OCTANE_COMPILE_FROZEN_AST;
		else process.env.OCTANE_COMPILE_FROZEN_AST = previous;
	});

	for (const [label, options] of MODES) {
		it(`does not mutate the parsed AST — ${label}`, () => {
			const result = compile(SOURCE, FILENAME, options);
			expect(result.code).toBeTruthy();
			expect(result.code).not.toContain('interface RowData');
		});
	}

	it('produces the Volar (types) output alongside enforcement', () => {
		// The Volar pipeline owns its parse (its @tsrx/core lowering is
		// copy-on-write); this smoke-checks it stays healthy under the same
		// process-wide enforcement flag.
		const volar = compileToVolarMappings(SOURCE, FILENAME);
		expect(volar.code).toContain('Static title');
		expect(volar.mappings.length).toBeGreaterThan(0);
	});

	it('emits byte-identical output with enforcement on and off', () => {
		const frozen = compile(SOURCE, FILENAME, { dev: true });
		delete process.env.OCTANE_COMPILE_FROZEN_AST;
		try {
			const unfrozen = compile(SOURCE, FILENAME, { dev: true });
			expect(frozen.code).toBe(unfrozen.code);
		} finally {
			process.env.OCTANE_COMPILE_FROZEN_AST = '1';
		}
	});
});
