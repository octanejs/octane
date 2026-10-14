import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixture, runCli } from './helpers/fixture.js';

// Transform the real compiler graph during suite collection. The subprocess
// assertion below still exercises a cold CLI startup without Vitest transforms.
import 'octane/compiler';

// `analyze` deliberately compiles with the project's own octane, so the fixture
// borrows a real installed one from this workspace rather than stubbing it: a
// stub would prove nothing about the diagnostics people actually get.
const WORKSPACE = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const OCTANE = path.join(WORKSPACE, 'packages/octane');
const BIN = path.join(WORKSPACE, 'packages/cli/src/bin/octane.js');

/** @type {{ cleanup: () => void }[]} */
const fixtures = [];

/**
 * @param {Record<string, string | object>} files
 */
function project(files) {
	const created = createFixture({
		'package.json': { name: 'analyzed', type: 'module', dependencies: { octane: '*' } },
		...files,
	});
	fixtures.push(created);
	return created;
}

afterEach(() => {
	while (fixtures.length > 0) fixtures.pop()?.cleanup();
});

/**
 * Analyze `files` through the workspace's octane compiler.
 *
 * @param {Record<string, string>} files
 * @param {string[]} [extra]
 */
async function analyze(files, extra = []) {
	const { root } = project(files);
	return runCli([
		'analyze',
		'--cwd',
		OCTANE,
		...Object.keys(files).map((f) => path.join(root, f)),
		...extra,
		'--json',
	]);
}

describe('octane analyze', () => {
	it('reports redundant Strong dependencies as hints without failing --strict', async () => {
		const { root } = project({
			'src/Hint.tsrx': `"use strong";
import { useEffect } from 'octane';
import { observe } from './external';
export function Hint({ value }) @{
  useEffect(() => { observe(value); }, [value]);
  <div />
}`,
		});
		// execFile rejects a nonzero exit, so this checks --strict's exit status too.
		const { stdout } = await promisify(execFile)(process.execPath, [
			BIN,
			'analyze',
			'--cwd',
			OCTANE,
			path.join(root, 'src/Hint.tsrx'),
			'--strict',
			'--json',
		]);
		const report = JSON.parse(stdout);
		expect(report.summary).toEqual({ errors: 0, warnings: 0, hints: 1 });
		expect(report.findings).toEqual([
			expect.objectContaining({
				code: 'OCTANE_STRONG_EXPLICIT_DEPENDENCIES',
				severity: 'hint',
			}),
		]);
	});
	it('reports a compiler diagnostic with its code, position and suggestion', async () => {
		const result = await analyze({
			'src/Bad.tsrx':
				'export function Bad() @{\n\t<input type="text" value={\'a\' as string} onChange={() => {}} />\n}\n',
		});

		const [finding] = result.json().findings;
		expect(finding.code).toBe('OCTANE_NATIVE_TEXT_ONCHANGE');
		expect(finding.severity).toBe('warning');
		expect(finding.line).toBe(2);
		expect(finding.message).toContain('onInput');
		// Suggestions are structured edits, not prose; they must be described,
		// never stringified into "[object Object]".
		expect(finding.suggestions).toEqual(['use `onInput` at 2:43']);
	});

	it('does not fail the run on warnings alone, but --strict does', async () => {
		const warning = {
			'src/Bad.tsrx':
				'export function Bad() @{\n\t<input type="text" value={\'a\' as string} onChange={() => {}} />\n}\n',
		};

		expect((await analyze(warning)).exitCode).toBe(0);
		expect((await analyze(warning, ['--strict'])).exitCode).toBe(3);
	});

	it('reports a file that will not parse as an error, and keeps going', async () => {
		const result = await analyze({
			'src/Broken.tsrx': 'export function Broken() @{ <div> }\n',
			'src/Bad.tsrx':
				'export function Bad() @{\n\t<input type="text" value={\'a\' as string} onChange={() => {}} />\n}\n',
		});

		const report = result.json();
		expect(report.summary).toEqual({ errors: 1, warnings: 1, hints: 0 });
		expect(report.analyzed).toBe(2);
		// The next file's findings survive the parse failure before it.
		expect(report.findings).toEqual([
			expect.objectContaining({
				file: expect.stringMatching(/Broken\.tsrx$/),
				code: 'OCTANE_PARSE_ERROR',
			}),
			expect.objectContaining({
				file: expect.stringMatching(/Bad\.tsrx$/),
				code: 'OCTANE_NATIVE_TEXT_ONCHANGE',
			}),
		]);
		expect(result.exitCode).toBe(3);
	});

	it('points a parse failure at its position without repeating it in the message', async () => {
		// A syntax error carries Acorn's `loc: { line, column }` and repeats it as a
		// `(2:10)` message tail; a parser diagnostic with a range, such as two
		// outputs in one code block, carries `loc: { start, end }` instead.
		const result = await analyze({
			'src/Syntax.tsrx': 'export function Syntax() @{\n\t<div>{1 +}</div>\n}\n',
			'src/Outputs.tsrx': 'export function Outputs() @{\n\t<div />\n\t<span />\n}\n',
		});

		const findings = result.json().findings;
		const finding = (/** @type {string} */ name) =>
			findings.find((/** @type {{ file: string }} */ found) => found.file.endsWith(name));
		expect(finding('Syntax.tsrx')).toEqual(
			expect.objectContaining({
				code: 'OCTANE_PARSE_ERROR',
				line: 2,
				column: 11,
				message: 'Unexpected token',
			}),
		);
		expect(finding('Outputs.tsrx')).toEqual(
			expect.objectContaining({
				code: 'OCTANE_PARSE_ERROR',
				line: 3,
				column: 2,
				message:
					"A code block renders a single node; wrap multiple nodes or text in a fragment '<>…</>'.",
			}),
		);
		expect(result.exitCode).toBe(3);
	});

	it('points a semantic compile error at its real line, not 1:1', async () => {
		// A slot-keyed hook in a plain JS loop is a compile error, and the compiler
		// appends the position to the message rather than setting `loc`. Reporting
		// it as a parse failure at 1:1 sends people hunting for a syntax mistake.
		const result = await analyze({
			'src/Loop.tsrx':
				"import { useState } from 'octane';\n\n" +
				'export function Loop() @{\n' +
				'\tconst values: number[] = [];\n' +
				'\tfor (const item of [1, 2, 3]) {\n' +
				'\t\tconst [value] = useState(item);\n' +
				'\t\tvalues.push(value);\n' +
				'\t}\n\n' +
				'\t<div>{String(values.length) as string}</div>\n}\n',
		});

		const [finding] = result.json().findings;
		expect(finding.code).toBe('OCTANE_COMPILE_ERROR');
		expect(finding.line).toBe(6);
		expect(finding.message).toContain('@for');
		// The position has its own columns now, so the duplicate tail is gone.
		expect(finding.message).not.toMatch(/\(\S+:\d+:\d+\)\s*$/);
		expect(result.exitCode).toBe(3);
	});

	it('separates an unreadable file from an unparseable one', async () => {
		const { root } = project({});
		const result = await runCli(
			['analyze', '--cwd', OCTANE, path.join(root, 'src/Nope.tsrx'), '--json'],
			{},
		);
		expect(result.json().findings[0].code).toBe('OCTANE_READ_ERROR');
	});

	it('says so when the project is clean', async () => {
		const result = await analyze({
			'src/Fine.tsrx': "export function Fine() @{ <div>{'ok' as string}</div> }\n",
		});

		expect(result.json()).toMatchObject({
			ok: true,
			summary: { errors: 0, warnings: 0, hints: 0 },
			findings: [],
		});
		expect(result.exitCode).toBe(0);
	});

	it('filters by diagnostic code', async () => {
		const files = {
			'src/Bad.tsrx':
				'export function Bad() @{\n\t<input type="text" value={\'a\' as string} onChange={() => {}} />\n}\n',
		};

		expect(
			(await analyze(files, ['--code', 'OCTANE_NATIVE_TEXT_ONCHANGE'])).json().findings,
		).toHaveLength(1);
		expect((await analyze(files, ['--code', 'OCTANE_SOMETHING_ELSE'])).json().findings).toEqual([]);
	});

	it('fails clearly when the project has no octane to compile with', async () => {
		// Spawned with NODE_PATH cleared. vitest points NODE_PATH at pnpm's hoisted
		// `.pnpm/node_modules`, which contains octane, so both an in-process run and
		// a naively spawned one resolve the compiler from there no matter what the
		// fixture declares, and this path would never be reached.
		const { root } = project({ 'src/A.tsrx': 'export function A() @{ <div /> }\n' });

		const { NODE_PATH: _ignored, ...env } = process.env;
		const result = await promisify(execFile)(process.execPath, [BIN, 'analyze', '--cwd', root], {
			env,
		})
			.then(() => ({ code: 0, stderr: '' }))
			.catch((error) => ({ code: error.code, stderr: String(error.stderr) }));

		expect(result.code).toBe(1);
		expect(result.stderr).toMatch(/Could not resolve `octane\/compiler`/);
	});
});

describe('octane analyze Strong coverage', () => {
	const EFFECT_UPDATE =
		"import { useState, useEffect } from 'octane';\n" +
		'export function App({ value }) @{\n' +
		'  const [current, setCurrent] = useState(0);\n' +
		'  useEffect(() => { setCurrent(value); });\n' +
		'  <p>{current as string}</p>\n' +
		'}\n';
	const PLAIN = 'export function Plain() @{ <div /> }\n';
	const STRONG = `"use strong";\n${PLAIN}`;

	/**
	 * A project that resolves the workspace's own octane and config loader, the
	 * way an installed app resolves them, so the coverage check exercises the
	 * real compiler policy rather than a stub.
	 *
	 * @param {Record<string, string | object>} files
	 */
	function app(files) {
		const created = project(files);
		mkdirSync(path.join(created.root, 'node_modules/@octanejs'), { recursive: true });
		symlinkSync(OCTANE, path.join(created.root, 'node_modules/octane'), 'dir');
		symlinkSync(
			path.join(WORKSPACE, 'packages/app-core'),
			path.join(created.root, 'node_modules/@octanejs/app-core'),
			'dir',
		);
		return created;
	}

	/**
	 * @param {string} root
	 * @param {string[]} [extra]
	 */
	const run = (root, extra = []) => runCli(['analyze', '--cwd', root, ...extra, '--json']);

	/** @param {string} root */
	const baseline = (root) =>
		JSON.parse(readFileSync(path.join(root, 'octane-strong-baseline.json'), 'utf8'));

	const CONFIG_STRONG = { 'octane.config.ts': 'export default { compiler: { strong: true } };\n' };

	it('analyzes modules under compiler.strong from octane.config', async () => {
		const strict = app({ ...CONFIG_STRONG, 'src/App.tsrx': EFFECT_UPDATE });
		const loose = app({ 'src/App.tsrx': EFFECT_UPDATE });

		const report = (await run(strict.root)).json();
		expect(report.findings).toEqual([
			expect.objectContaining({
				file: 'src/App.tsrx',
				code: 'OCTANE_STRONG_EFFECT_STATE_UPDATE',
				line: 4,
			}),
		]);
		expect(report.findings[0].message).toMatch(/^Strong mode does not allow/);
		expect((await run(loose.root)).json().findings).toEqual([]);
	});

	it('applies compiler.strong to Octane .tsx found by default, not to React .tsx', async () => {
		const effectUpdate =
			"import { useState, useEffect } from 'octane';\n" +
			'export function App({ value }) {\n' +
			'  const [current, setCurrent] = useState(0);\n' +
			'  useEffect(() => { setCurrent(value); });\n' +
			'  return <p>{current}</p>;\n' +
			'}\n';
		const { root } = app({
			...CONFIG_STRONG,
			// tsconfig hands .tsx to React; only the pragma claims Island for Octane.
			'tsconfig.json': { compilerOptions: { jsx: 'react-jsx', jsxImportSource: 'react' } },
			'src/Host.tsx': effectUpdate,
			'src/Island.tsx': `/** @jsxImportSource octane */\n${effectUpdate}`,
		});

		const report = (await run(root)).json();
		expect(report.analyzed).toBe(1);
		// Strong does not compile `.tsx`, so the module reports that first.
		expect(report.findings).toEqual([
			expect.objectContaining({
				file: 'src/Island.tsx',
				code: 'OCTANE_STRONG_TSX_MODULE',
				line: 1,
			}),
			expect.objectContaining({
				file: 'src/Island.tsx',
				code: 'OCTANE_STRONG_EFFECT_STATE_UPDATE',
				line: 5,
			}),
		]);
	});

	it('records every Octane module that compiles without Strong mode', async () => {
		const { root } = app({
			'tsconfig.json': { compilerOptions: { jsx: 'preserve', jsxImportSource: 'octane' } },
			'src/Strong.tsrx': STRONG,
			'src/Loose.tsrx': PLAIN,
			'src/Card.tsx': 'export function Card() { return <div />; }\n',
			'src/Host.tsx': '/** @jsxImportSource react */\nexport function Host() { return <div />; }\n',
			'src/use-count.ts':
				"import { useState } from 'octane';\nexport function useCount() { return useState(0); }\n",
			'src/strong-hook.ts':
				"'use strong';\nimport { useState } from 'octane';\nexport function useOne() { return useState(1); }\n",
			'src/types.ts': "import type { OctaneNode } from 'octane';\nexport type Node = OctaneNode;\n",
			'src/no-semi.ts':
				"import { add } from './math'\nimport type { OctaneNode } from 'octane'\nexport type Sum = OctaneNode\n",
			// Every specifier is type-marked, so TypeScript erases the import.
			'src/inline-types.ts':
				"import { type OctaneNode, type Root } from 'octane';\nexport type Pair = [OctaneNode, Root];\n",
			// Comments are not specifiers, so these imports are still erased.
			'src/commented-types.ts':
				"import /* types */ type { Root } from 'octane';\n" +
				"import {\n  type OctaneNode, // rendered\n  /* host */ type Context,\n} from 'octane';\n" +
				'export type All = [Root, OctaneNode, Context<unknown>];\n',
			'src/mixed.ts':
				"import { type OctaneNode, useState } from 'octane';\nexport function useNode(): OctaneNode { return useState(null)[0]; }\n",
			'src/math.ts': 'export const add = (a: number, b: number) => a + b;\n',
			'src/env.d.ts': "import 'octane';\n",
		});

		const result = await run(root, ['--strong-baseline', 'init']);
		expect(result.exitCode).toBe(0);
		expect(baseline(root)).toEqual({
			version: 1,
			exceptions: ['src/Card.tsx', 'src/Loose.tsrx', 'src/mixed.ts', 'src/use-count.ts'],
		});
		expect(result.json().strongCoverage).toEqual({
			baseline: 'octane-strong-baseline.json',
			modules: 6,
			strong: 2,
			exceptions: 4,
			regressions: [],
			stale: [],
		});
		expect((await run(root)).exitCode).toBe(0);
	});

	it('leaves tsx that tsconfig hands to another JSX library out of coverage', async () => {
		const { root } = app({
			'tsconfig.json': { compilerOptions: { jsx: 'react-jsx', jsxImportSource: 'react' } },
			'src/Host.tsx': 'export function Host() { return <div />; }\n',
			'src/Island.tsx':
				'/** @jsxImportSource octane */\nexport function Island() { return <div />; }\n',
		});

		await run(root, ['--strong-baseline', 'init']);
		expect(baseline(root).exceptions).toEqual(['src/Island.tsx']);
	});

	it('fails on a module that is neither Strong nor a recorded exception', async () => {
		const { root, write } = app({
			'src/Strong.tsrx': STRONG,
			'octane-strong-baseline.json': { version: 1, exceptions: [] },
		});
		expect((await run(root)).exitCode).toBe(0);

		// Deleting the directive is the cheapest way out of every Strong rule.
		write('src/Strong.tsrx', PLAIN);
		write('src/New.tsrx', PLAIN);
		const result = await run(root);
		expect(result.exitCode).toBe(3);
		expect(result.json().strongCoverage.regressions).toEqual(['src/New.tsrx', 'src/Strong.tsrx']);
		const [finding] = result.json().findings;
		expect(finding).toMatchObject({
			code: 'OCTANE_STRONG_COVERAGE_REGRESSION',
			severity: 'error',
			line: 1,
		});
		expect(finding.message).toContain('Add "use strong" before its imports');
	});

	it('does not extend compiler.strong to another package in the project', async () => {
		const { root } = app({
			...CONFIG_STRONG,
			'src/Covered.tsrx': PLAIN,
			'packages/inner/package.json': { name: 'inner', dependencies: { octane: '*' } },
			'packages/inner/src/Inner.tsrx': PLAIN,
			'octane-strong-baseline.json': { version: 1, exceptions: [] },
		});

		const result = await run(root);
		expect(result.json().findings).toEqual([
			expect.objectContaining({
				file: 'packages/inner/src/Inner.tsrx',
				code: 'OCTANE_STRONG_COVERAGE_REGRESSION',
			}),
		]);
		expect(result.json().findings[0].message).toContain(
			'does not reach modules of another package',
		);
	});

	it('fails on stale names, and update removes only those', async () => {
		const { root } = app({
			'src/Now.tsrx': STRONG,
			'src/Still.tsrx': PLAIN,
			'src/Fresh.tsrx': PLAIN,
			'octane-strong-baseline.json': {
				version: 1,
				exceptions: ['src/Gone.tsrx', 'src/Now.tsrx', 'src/Still.tsrx'],
			},
		});

		const before = await run(root);
		expect(before.exitCode).toBe(3);
		expect(
			before
				.json()
				.findings.filter((/** @type {any} */ f) => f.code === 'OCTANE_STRONG_COVERAGE_STALE')
				.map((/** @type {any} */ f) => [f.file, f.line]),
		).toEqual([
			['octane-strong-baseline.json', 4],
			['octane-strong-baseline.json', 5],
		]);

		const updated = await run(root, ['--strong-baseline', 'update']);
		// The regression is still reported, and update never records it.
		expect(updated.exitCode).toBe(3);
		expect(updated.json().findings.map((/** @type {any} */ f) => f.code)).toEqual([
			'OCTANE_STRONG_COVERAGE_REGRESSION',
		]);
		expect(baseline(root).exceptions).toEqual(['src/Still.tsrx']);
	});

	it('checks named files for regressions without judging the rest of the baseline', async () => {
		const { root } = app({
			'src/Named.tsrx': PLAIN,
			'octane-strong-baseline.json': { version: 1, exceptions: ['src/Gone.tsrx'] },
		});

		const result = await runCli([
			'analyze',
			'--cwd',
			root,
			path.join(root, 'src/Named.tsrx'),
			'--json',
		]);
		expect(result.json().findings.map((/** @type {any} */ f) => f.code)).toEqual([
			'OCTANE_STRONG_COVERAGE_REGRESSION',
		]);
		expect(result.json().strongCoverage.stale).toEqual([]);
	});

	it('refuses baseline writes that would not be a ratchet', async () => {
		const { root } = app({
			'src/A.tsrx': PLAIN,
			'octane-strong-baseline.json': { version: 1, exceptions: [] },
		});
		const fresh = app({ 'src/A.tsrx': PLAIN });

		expect((await run(root, ['--strong-baseline', 'init'])).exitCode).toBe(2);
		expect((await run(fresh.root, ['--strong-baseline', 'update'])).exitCode).toBe(2);
		expect(
			(
				await runCli([
					'analyze',
					'--cwd',
					fresh.root,
					path.join(fresh.root, 'src/A.tsrx'),
					'--strong-baseline',
					'init',
				])
			).exitCode,
		).toBe(2);
		expect(existsSync(path.join(fresh.root, 'octane-strong-baseline.json'))).toBe(false);
		expect(baseline(root).exceptions).toEqual([]);
	});

	it('writes nothing under --dry-run', async () => {
		const { root } = app({ 'src/A.tsrx': PLAIN });
		const result = await run(root, ['--strong-baseline', 'init', '--dry-run']);
		expect(result.exitCode).toBe(0);
		expect(existsSync(path.join(root, 'octane-strong-baseline.json'))).toBe(false);
	});

	it('lists the non-Strong Octane modules that Strong modules import from other packages', async () => {
		const octane = { peerDependencies: { octane: '*' } };
		const hook = (/** @type {string} */ name) =>
			`import { useState } from 'octane';\nexport function ${name}() { return useState(0); }\n`;
		const { root } = app({
			'src/App.tsrx':
				'"use strong";\n' +
				"import { Button, Chart, Dialog, Menu, Sheet } from './ui';\n" +
				"import { useStore } from '@kit/store';\n" +
				"import { format } from 'plain';\n" +
				"import { Local } from './Local';\n" +
				'export function App() @{ <Button /> }\n',
			// The app's own barrel is followed through to the package it re-exports.
			'src/ui.ts': "export * from '@kit/ui';\n",
			'src/Local.tsrx': PLAIN,
			'src/Bridge.tsrx': `"use strong";\nimport { ReactCompat } from 'octane/react';\n${PLAIN}`,
			// Only Strong modules are followed.
			'src/Loose.tsrx': `import { Extra } from '@kit/extra';\n${PLAIN}`,
			'node_modules/@kit/ui/package.json': {
				name: '@kit/ui',
				...octane,
				exports: {
					'.': { types: './src/index.ts', require: './dist/index.cjs', import: './src/index.ts' },
				},
			},
			// Only the modules that define a name App imports count, not every
			// module the barrel re-exports.
			'node_modules/@kit/ui/src/index.ts':
				"export { Button } from './Button';\n" +
				"export * from './dialog/index.js';\n" +
				"export * from './hooks';\n" +
				"export { Chart } from './Chart';\n" +
				"export { Unused } from './Unused';\n" +
				"export * as Menu from './Menu';\n",
			'node_modules/@kit/ui/src/Button.tsx': 'export function Button() { return <button />; }\n',
			'node_modules/@kit/ui/src/Menu.tsx':
				"import { Item } from './MenuItem';\nexport function Root() { return <Item />; }\n",
			// Menu's own import is its implementation, not something App imports.
			'node_modules/@kit/ui/src/MenuItem.tsx': 'export function Item() { return <li />; }\n',
			'node_modules/@kit/ui/src/dialog/index.ts':
				"export { Dialog } from './Dialog';\nexport { Sheet } from './Sheet';\n",
			'node_modules/@kit/ui/src/dialog/Sheet.tsx':
				'export function Sheet() { return <aside />; }\n',
			'node_modules/@kit/ui/src/dialog/Dialog.tsrx':
				'"use strong";\nexport function Dialog() @{ <dialog /> }\n',
			'node_modules/@kit/ui/src/hooks.ts': `import { ReactCompat } from 'octane/react';\n${hook('useHidden')}`,
			'node_modules/@kit/ui/src/Unused.tsx': 'export function Unused() { return <u />; }\n',
			'node_modules/@kit/ui/src/Chart.tsx':
				"import { ReactCompat } from 'octane/react';\nexport function Chart() { return <ReactCompat />; }\n",
			'node_modules/@kit/store/package.json': {
				name: '@kit/store',
				...octane,
				exports: './src/index.ts',
			},
			'node_modules/@kit/store/src/index.ts': hook('useStore'),
			'node_modules/@kit/extra/package.json': { name: '@kit/extra', ...octane, main: 'index.tsx' },
			'node_modules/@kit/extra/index.tsx': 'export function Extra() { return <b />; }\n',
			// Not an Octane package, so its .tsx is not Octane's to make Strong.
			'node_modules/plain/package.json': { name: 'plain', main: 'index.js' },
			'node_modules/plain/index.js': "export { format } from './format.tsx';\n",
			'node_modules/plain/format.tsx': 'export const format = () => <b />;\n',
		});

		const result = await run(root, ['--strong-dependencies', '--strict']);
		expect(result.exitCode).toBe(0);
		expect(result.json().strongDependencies).toEqual({
			packages: [
				{ name: '@kit/store', modules: ['src/index.ts'], importers: ['src/App.tsrx'] },
				{
					name: '@kit/ui',
					modules: ['src/Button.tsx', 'src/Chart.tsx', 'src/Menu.tsx', 'src/dialog/Sheet.tsx'],
					importers: ['src/App.tsrx'],
				},
			],
			reactCompat: [
				{ package: '@kit/ui', module: 'src/Chart.tsx', importers: ['src/App.tsrx'] },
				{ package: 'analyzed', module: 'src/Bridge.tsrx', importers: ['src/Bridge.tsrx'] },
			],
		});
	});

	it('resolves Strong dependencies the way a client build does', async () => {
		const component = (/** @type {string} */ name) =>
			`export function ${name}() { return <b />; }\n`;
		const { root } = app({
			'src/App.tsrx':
				'"use strong";\n' +
				"import Kit, { Star, Pair, Duo, Broken } from '@kit/lib';\n" +
				"import { Server } from '@kit/lib/server';\n" +
				"import { Ring } from '@kit/lib/icons/ring';\n" +
				PLAIN,
			'node_modules/@kit/lib/package.json': {
				name: '@kit/lib',
				peerDependencies: { octane: '*' },
				exports: {
					// An array lists fallbacks in order.
					'.': [{ import: './src/index.ts' }, './dist/index.cjs'],
					// A matched null target excludes the export from client builds.
					'./server': { browser: null, default: './src/Server.tsx' },
					// The pattern with the longest prefix wins, whatever the key order.
					'./*': { require: './dist/*.cjs' },
					'./icons/*': './src/icons/*.tsx',
				},
			},
			'node_modules/@kit/lib/src/index.ts':
				"export * from './Star';\n" +
				// `export *` never passes on a default export.
				"export * from './Fallback';\n" +
				"export { default } from './Kit';\n" +
				"export { Pair } from './pair';\n" +
				"export { Duo } from './duo';\n" +
				"export { Broken } from './Broken';\n",
			'node_modules/@kit/lib/src/Star.tsx': component('Star'),
			'node_modules/@kit/lib/src/Fallback.tsx':
				'export default function Fallback() { return <i />; }\n',
			'node_modules/@kit/lib/src/Kit.tsx': 'export default function Kit() { return <u />; }\n',
			// A second declarator, and a destructured name, are declared here.
			'node_modules/@kit/lib/src/pair.tsx':
				'export const Left = () => <i />, Pair = () => <b />;\n',
			'node_modules/@kit/lib/src/duo.tsx': 'export const { Duo } = { Duo: () => <u /> };\n',
			// A module that does not parse fails its own build and is left out.
			'node_modules/@kit/lib/src/Broken.tsx':
				'"use strong";\nexport function Broken() { return <div> }\n',
			'node_modules/@kit/lib/src/Server.tsx': component('Server'),
			'node_modules/@kit/lib/src/icons/ring.tsx': component('Ring'),
		});

		const result = await run(root, ['--strong-dependencies']);
		expect(result.json().strongDependencies).toEqual({
			packages: [
				{
					name: '@kit/lib',
					modules: [
						'src/Kit.tsx',
						'src/Star.tsx',
						'src/duo.tsx',
						'src/icons/ring.tsx',
						'src/pair.tsx',
					],
					importers: ['src/App.tsrx'],
				},
			],
			reactCompat: [],
		});
	});
});

describe('octane analyze Strong migration', () => {
	/**
	 * @param {Record<string, string | object>} files
	 */
	function app(files) {
		const created = project(files);
		mkdirSync(path.join(created.root, 'node_modules'), { recursive: true });
		symlinkSync(OCTANE, path.join(created.root, 'node_modules/octane'), 'dir');
		return created;
	}

	/**
	 * @param {string} root
	 * @param {string[]} [extra]
	 */
	const run = (root, extra = []) => runCli(['analyze', '--cwd', root, ...extra, '--json']);

	const CLOCK =
		'"use strong";\n' +
		'export function Clock() {\n' +
		'  const now = Date.now();\n' +
		'  const seed = Math.random();\n' +
		'  return <span>{now}:{seed}</span>;\n' +
		'}\n';

	const CART =
		"import { useCallback, useMemo, useRef, useState } from 'octane';\n" +
		'class Store { add() {} }\n' +
		'export function Cart({ items }: { items: number[] }) {\n' +
		'  const store = useRef<Store | null>(null);\n' +
		'  if (store.current === null) store.current = new Store();\n' +
		'  const total = useMemo(() => items.reduce((a, b) => a + b, 0), [items]);\n' +
		'  const add = useCallback(() => store.current?.add(), []);\n' +
		'  const [open] = useState(false);\n' +
		'  return <button onClick={add}>{String(total) + String(open)}</button>;\n' +
		'}\n';

	it('reports every Strong violation in a file, not only the first', async () => {
		const result = await analyze({ 'src/Clock.tsrx': CLOCK });

		expect(result.json().findings).toEqual([
			expect.objectContaining({ code: 'OCTANE_STRONG_RENDER_IMPURE_CALL', line: 3 }),
			expect.objectContaining({ code: 'OCTANE_STRONG_RENDER_IMPURE_CALL', line: 4 }),
		]);
		expect(result.json().findings[0].url).toBe(
			'https://octanejs.dev/docs/strong-mode#octane-strong-render-impure-call',
		);
		expect(result.exitCode).toBe(3);
	});

	it('keeps Strong findings when code generation then fails', async () => {
		const result = await analyze({
			'src/Loop.tsrx':
				'"use strong";\n' +
				"import { useEffect, useState } from 'octane';\n" +
				"import { observe } from './external';\n" +
				'export function Loop({ value }) @{\n' +
				'\tuseEffect(() => { observe(value); }, [value]);\n' +
				'\tfor (const item of [1, 2]) {\n' +
				'\t\tconst [current] = useState(item);\n' +
				'\t}\n' +
				'\t<div />\n' +
				'}\n',
		});

		// Strong analysis passes the module with a hint, and slotting its hooks
		// then throws. Neither hides the other.
		expect(result.json().findings).toEqual([
			expect.objectContaining({ code: 'OCTANE_STRONG_EXPLICIT_DEPENDENCIES', severity: 'hint' }),
			expect.objectContaining({ code: 'OCTANE_COMPILE_ERROR', line: 7 }),
		]);
	});

	it("analyzes Octane .tsx by default and leaves another framework's .tsx alone", async () => {
		const { root } = app({
			'tsconfig.json': { compilerOptions: { jsx: 'preserve', jsxImportSource: 'octane' } },
			'src/Clock.tsx': CLOCK,
			// Strong would reject this, but its JSX belongs to React.
			'src/Host.tsx': `/** @jsxImportSource react */\n${CLOCK}`,
		});

		const report = (await run(root)).json();
		expect(report.analyzed).toBe(1);
		expect(new Set(report.findings.map((/** @type {{ file: string }} */ f) => f.file))).toEqual(
			new Set(['src/Clock.tsx']),
		);
	});

	it('previews what Strong would reject without failing the run', async () => {
		const { root } = app({ 'src/Cart.tsx': CART });

		const result = await run(root, ['--strong-preview']);
		expect(result.exitCode).toBe(0);
		expect(result.json().strongPreview).toEqual({
			findings: 3,
			modules: 1,
			byCode: {
				OCTANE_STRONG_TSX_MODULE: 1,
				OCTANE_STRONG_RENDER_REF_READ: 1,
				OCTANE_STRONG_RENDER_REF_WRITE: 1,
			},
		});
		expect(result.json().findings.every((/** @type {{ preview?: true }} */ f) => f.preview)).toBe(
			true,
		);
		// Without the preview the module is not Strong, so there is nothing to report.
		expect((await run(root)).json().findings).toEqual([]);
	});

	it('applies the suggested rewrites with --fix, and writes nothing under --dry-run', async () => {
		const { root } = app({ 'src/Cart.tsx': CART });
		const file = path.join(root, 'src/Cart.tsx');

		const dry = await run(root, ['--strong-preview', '--fix', '--dry-run']);
		expect(dry.json().fixed).toEqual({ findings: 1, files: ['src/Cart.tsx'] });
		expect(readFileSync(file, 'utf8')).toBe(CART);

		const result = await run(root, ['--strong-preview', '--fix']);
		expect(result.json().fixed).toEqual({ findings: 1, files: ['src/Cart.tsx'] });
		expect(readFileSync(file, 'utf8')).toBe(
			"import { useCallback, useMemo, useState, useLazyRef } from 'octane';\n" +
				'class Store { add() {} }\n' +
				'export function Cart({ items }: { items: number[] }) {\n' +
				'  const store = useLazyRef(() => new Store());\n' +
				'  const total = useMemo(() => items.reduce((a, b) => a + b, 0), [items]);\n' +
				'  const add = useCallback(() => store.current?.add(), []);\n' +
				'  const [open] = useState(false);\n' +
				'  return <button onClick={add}>{String(total) + String(open)}</button>;\n' +
				'}\n',
		);
		// What remains is reported from the rewritten module: only the `.tsx`
		// module itself, which has to become `.tsrx` before it can be Strong.
		expect(result.json().findings).toEqual([
			expect.objectContaining({ code: 'OCTANE_STRONG_TSX_MODULE', preview: true }),
		]);
		expect(result.json().strongPreview.findings).toBe(1);
	});

	it('falls back to the first error with an older compiler that cannot collect', async () => {
		// An installed octane from before collectDiagnostics exposes only
		// compile(). The real compile() stands in for it, so the fallback reports
		// the error that compile() actually throws.
		const { root } = project({
			'node_modules/octane/package.json': {
				name: 'octane',
				type: 'module',
				exports: { './compiler': './compiler.js' },
			},
			'node_modules/octane/compiler.js': `export { compile } from ${JSON.stringify(
				pathToFileURL(path.join(OCTANE, 'src/compiler/index.js')).href,
			)};\n`,
			'src/Clock.tsrx':
				'"use strong";\n' +
				'export function Clock() @{\n' +
				'  const now = Date.now();\n' +
				'  const seed = Math.random();\n' +
				'  <span>{(String(now) + String(seed)) as string}</span>\n' +
				'}\n',
		});

		const result = await runCli(['analyze', '--cwd', root, '--json']);
		// Both clock reads are violations, but compile() throws only the first.
		expect(result.json().findings).toEqual([
			expect.objectContaining({ code: 'OCTANE_STRONG_RENDER_IMPURE_CALL', line: 3, column: 15 }),
		]);
		expect(result.exitCode).toBe(3);
		// The report must not read as complete when it cannot be.
		const text = await runCli(['analyze', '--cwd', root]);
		expect(text.stdout + text.stderr).toContain('reports only the first error in each file');
	});
});
