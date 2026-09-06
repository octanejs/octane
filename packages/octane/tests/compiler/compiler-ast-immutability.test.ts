import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
// components (normalized), scoped styles (restamped/hashed) — including blocks
// inside `@if` and `@for` bodies, whose CSS AST nodes carry no `loc` and once
// received in-place module positions — hooks with inferred deps, events,
// directive control flow, and spreads.
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
			<>
				<style>
					ul {
						list-style: none;
					}
				</style>
				<ul>
					@for (const row of visible; key row.id) {
						<>
							<style>
								li {
									margin: 0;
								}
							</style>
							{/* Parser comments are immutable authored nodes too. */}
							<li>
								<Row row={row} onPick={(id) => setRows(rows.filter((r) => r.id !== id))} />
							</li>
						</>
					} @empty {
						<li>Empty</li>
					}
				</ul>
			</>
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
			// The branch-body blocks scope as compound selectors: a stray position
			// stamp on the CSS nodes used to print `.tsrx-xxx ul` instead.
			expect(result.code).toMatch(/ul\.tsrx-[0-9a-f]+\s*\{/);
			expect(result.code).toMatch(/li\.tsrx-[0-9a-f]+\s*\{/);
			expect(result.code).not.toMatch(/\.tsrx-[0-9a-f]+\s+(?:ul|li|div)\b/);
		});
	}

	it('resolves descriptor children shadows without annotating authored JSX nodes', () => {
		const source = `
			import { descriptorChildren } from 'octane';
			function Ordinary(props) { return props.children; }
			const Marked = descriptorChildren(Ordinary);
			export function App(Marked) @{
				<main>
					<style>main { color: red; }</style>
					<Marked><button>shadowed</button></Marked>
				</main>
			}`;
		for (const options of [{}, { hmr: false }, { mode: 'server' }] as const) {
			const result = compile(source, 'marked-shadow-frozen.tsrx', options);
			expect(result.code).toContain('shadowed');
		}
	});

	// RFC tsrx-org/RFCs#1 scoped-style fixtures: every scope shape (multi-block
	// scopes, nested `@{}`, directive branches, assigned templates, assigned
	// blocks in every declaration position, `apply` in every form) runs the
	// copy-on-write style pre-pass over a frozen parser AST.
	const STYLE_FIXTURES = [
		'style-scopes',
		'style-theme',
		'style-theme-consumer',
		'style-element-rooted',
		'style-local-assigned',
		'return-style',
	];
	const FIXTURE_DIR = join(process.cwd(), 'packages/octane/tests/_fixtures');

	describe.each(STYLE_FIXTURES)('scoped-style fixture %s', (name) => {
		const source = readFileSync(join(FIXTURE_DIR, `${name}.tsrx`), 'utf8');
		for (const [label, options] of MODES) {
			it(`does not mutate the parsed AST — ${label}`, () => {
				const result = compile(source, `${name}.tsrx`, options);
				expect(result.code).toBeTruthy();
				if (options.mode !== 'server') expect(result.code).toContain('injectStyle(');
			});
		}

		it('emits byte-identical output with enforcement on and off', () => {
			const frozen = compile(source, `${name}.tsrx`, { dev: true });
			delete process.env.OCTANE_COMPILE_FROZEN_AST;
			try {
				const unfrozen = compile(source, `${name}.tsrx`, { dev: true });
				expect(frozen.code).toBe(unfrozen.code);
			} finally {
				process.env.OCTANE_COMPILE_FROZEN_AST = '1';
			}
		});
	});

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
