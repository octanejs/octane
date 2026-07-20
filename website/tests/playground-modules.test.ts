// Module-graph pipeline tests — the parent-side half of the sandbox boundary:
// sibling-file resolution, the esm.sh rewrite policy for third-party imports,
// React-host (sucrase) compilation, and dependency ordering. What these protect:
// code the sandbox receives must only ever reference sibling tokens, bare
// import-map specifiers, or https://esm.sh/ URLs.
import { describe, it, expect } from 'vitest';
import { buildModuleGraph, isReactHostFile } from '../src/lib/playground-modules.ts';
import { moduleToken } from '../src/lib/playground-sandbox.ts';

const APP = 'App.tsrx';
const app = (source: string) => ({ name: APP, source });

describe('sibling imports', () => {
	it('resolves extensionless sibling imports and orders dependencies first', async () => {
		const graph = await buildModuleGraph(
			[
				app("import { x } from './Data';\nexport default function App() @{ <b>{'v:' + x}</b> }"),
				{ name: 'Data.tsrx', source: 'export const x = 1;' },
			],
			APP,
		);
		expect(graph.ok).toBe(true);
		if (!graph.ok) return;
		expect(graph.entryKind).toBe('octane');
		expect(graph.modules.map((m) => m.name)).toEqual(['Data.tsrx', APP]);
		const entry = graph.modules.find((m) => m.name === APP)!;
		expect(entry.code).toContain(moduleToken('Data.tsrx'));
		expect(entry.code).not.toContain("'./Data'");
	});

	it('rewrites dynamic sibling imports with quotes intact', async () => {
		const graph = await buildModuleGraph(
			[
				app(
					"export default function App() @{\n\tconst load = () => import('./Data.tsrx');\n\t<button onClick={() => void load()}>go</button>\n}",
				),
				{ name: 'Data.tsrx', source: 'export const x = 1;' },
			],
			APP,
		);
		expect(graph.ok).toBe(true);
		if (!graph.ok) return;
		const entry = graph.modules.find((m) => m.name === APP)!;
		expect(entry.code).toContain(`import(${JSON.stringify(moduleToken('Data.tsrx'))})`);
	});

	it('rejects imports of files that do not exist', async () => {
		const graph = await buildModuleGraph([app("import { x } from './Nope';")], APP);
		expect(graph).toMatchObject({ ok: false });
		if (!graph.ok) expect(graph.error).toContain('"./Nope" does not match any playground file');
	});

	it('rejects parent-directory and absolute imports', async () => {
		for (const specifier of ['../x.ts', '/etc/passwd']) {
			const graph = await buildModuleGraph([app(`import { x } from '${specifier}';`)], APP);
			expect(graph.ok).toBe(false);
		}
	});

	it('reports circular sibling imports with the cycle path', async () => {
		const graph = await buildModuleGraph(
			[
				{ name: 'A.tsrx', source: "import './B';\nexport const a = 1;" },
				{ name: 'B.tsrx', source: "import './A';\nexport const b = 1;" },
			],
			'A.tsrx',
		);
		expect(graph.ok).toBe(false);
		if (!graph.ok) expect(graph.error).toContain('Circular imports');
	});

	it('rejects a missing entry and duplicate names', async () => {
		expect((await buildModuleGraph([app('export const x = 1;')], 'Nope.tsrx')).ok).toBe(false);
		expect(
			(await buildModuleGraph([app('export const x = 1;'), app('export const y = 2;')], APP)).ok,
		).toBe(false);
	});
});

describe('third-party import policy', () => {
	it('rewrites bare specifiers to esm.sh with the octane singleton pinned external', async () => {
		const graph = await buildModuleGraph(
			[app("import { createStore } from 'zustand/vanilla';\nexport const s = createStore;")],
			APP,
		);
		expect(graph.ok).toBe(true);
		if (!graph.ok) return;
		expect(graph.modules[0].code).toContain("'https://esm.sh/zustand/vanilla?external=octane'");
	});

	it('handles scoped and versioned specifiers', async () => {
		const graph = await buildModuleGraph(
			[
				app(
					"import a from '@octanejs/zustand';\nimport b from 'motion@12/mini';\nexport const x = [a, b];",
				),
			],
			APP,
		);
		expect(graph.ok).toBe(true);
		if (!graph.ok) return;
		expect(graph.modules[0].code).toContain("'https://esm.sh/@octanejs/zustand?external=octane'");
		expect(graph.modules[0].code).toContain("'https://esm.sh/motion@12/mini?external=octane'");
	});

	it('leaves import-map-owned specifiers bare', async () => {
		const graph = await buildModuleGraph(
			[
				app(
					"import { useState } from 'octane';\nexport default function App() @{\n\tconst [n] = useState(0);\n\t<b>{'n: ' + n}</b>\n}",
				),
			],
			APP,
		);
		expect(graph.ok).toBe(true);
		if (!graph.ok) return;
		expect(graph.modules[0].code).toContain("from 'octane'");
		expect(graph.modules[0].code).not.toContain('esm.sh/octane');
	});

	it('allows verbatim esm.sh URLs but no other URL imports', async () => {
		const ok = await buildModuleGraph(
			[app("import x from 'https://esm.sh/canvas-confetti';\nexport const y = x;")],
			APP,
		);
		expect(ok.ok).toBe(true);
		const bad = await buildModuleGraph(
			[app("import x from 'https://evil.example/x.js';\nexport const y = x;")],
			APP,
		);
		expect(bad.ok).toBe(false);
	});

	it('rejects octane subpaths the sandbox does not provide', async () => {
		const graph = await buildModuleGraph([app("import { compile } from 'octane/compiler';")], APP);
		expect(graph.ok).toBe(false);
		if (!graph.ok) expect(graph.error).toContain('octane/compiler');
	});
});

describe('React-host files', () => {
	it('marks .react.tsx files and compiles them with the react-jsx transform', async () => {
		expect(isReactHostFile('App.react.tsx')).toBe(true);
		expect(isReactHostFile('App.tsx')).toBe(false);
		expect(isReactHostFile('App.tsrx')).toBe(false);

		const graph = await buildModuleGraph(
			[
				{
					name: 'App.react.tsx',
					source:
						"import { Island } from './Island.tsrx';\nexport default function App() {\n\treturn <main><Island /></main>;\n}",
				},
				{ name: 'Island.tsrx', source: 'export function Island() @{ <b>island</b> }' },
			],
			'App.react.tsx',
		);
		expect(graph.ok).toBe(true);
		if (!graph.ok) return;
		expect(graph.entryKind).toBe('react');
		const host = graph.modules.find((m) => m.name === 'App.react.tsx')!;
		// The automatic react-jsx transform, not octane's compiler: jsx() calls
		// against react's runtime, and the sibling island as a token.
		expect(host.code).toContain('react/jsx-runtime');
		expect(host.code).not.toContain('octane/jsx-runtime');
		expect(host.code).toContain(moduleToken('Island.tsrx'));
	});

	it('surfaces sucrase syntax errors as ordinary compile failures', async () => {
		const graph = await buildModuleGraph(
			[{ name: 'App.react.tsx', source: 'export default function App() { return <div; }' }],
			'App.react.tsx',
		);
		expect(graph.ok).toBe(false);
		if (!graph.ok) expect(graph.error).toContain('App.react.tsx');
	});
});

describe('diagnostics', () => {
	it('aggregates warnings per file with real file names', async () => {
		const graph = await buildModuleGraph(
			[
				app("import './Field';\nexport default function App() @{ <b>x</b> }"),
				{
					name: 'Field.tsrx',
					source: 'export function Field() @{ <input onChange={() => {}} /> }',
				},
			],
			APP,
		);
		expect(graph.ok).toBe(true);
		if (!graph.ok) return;
		expect(graph.warnings).toHaveLength(1);
		expect(graph.warnings[0].file).toBe('Field.tsrx');
		expect(graph.warnings[0].diagnostic).toMatchObject({
			code: 'OCTANE_NATIVE_TEXT_ONCHANGE',
			filename: 'Field.tsrx',
		});
	});

	it('keeps per-file compiled output for the output pane', async () => {
		const graph = await buildModuleGraph([app('export default function App() @{ <b>x</b> }')], APP);
		expect(graph.ok).toBe(true);
		if (!graph.ok) return;
		expect(graph.compiled.get(APP)).toContain("from 'octane'");
	});
});
