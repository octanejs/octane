import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
			'src/Fine.tsrx': "export function Fine() @{ <div>{'ok' as string}</div> }\n",
		});

		const report = result.json();
		expect(report.summary).toEqual({ errors: 1, warnings: 0, hints: 0 });
		expect(report.analyzed).toBe(2);
		expect(report.findings[0].code).toBe('OCTANE_PARSE_ERROR');
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

	it('keeps a thrown style diagnostic code and its real position', async () => {
		// The analyzer throws semantic style errors with `error.code` set and an
		// acorn-style `loc.start`. Agents filter (`--code`) and search docs on the
		// code; flattening it orphans the diagnostic.
		const result = await analyze({
			'src/Placement.tsrx':
				'export function C() {\n\treturn <section><style>.a { color: red; }</style><div class="a" /></section>;\n}\n',
		});

		const [finding] = result.json().findings;
		expect(finding.code).toBe('tsrx-style-standalone-outside-template');
		expect(finding.severity).toBe('error');
		expect(finding.line).toBe(2);
		expect(result.exitCode).toBe(3);
	});

	it('reports collected style diagnostics under their kebab codes', async () => {
		const files = {
			'src/Bad.tsrx':
				'export function Bad() @{\n\t<>\n\t\t<style>.a { colr: red; }</style>\n\t\t<div class="a" />\n\t</>\n}\n',
		};

		const [finding] = (await analyze(files)).json().findings;
		expect(finding.code).toBe('octane-css-unknown-property');
		expect(finding.severity).toBe('error');
		expect(finding.message).toContain('colr');
		expect(
			(await analyze(files, ['--code', 'octane-css-unknown-property'])).json().findings,
		).toHaveLength(1);
	});

	it('enforces a claimed token contract inside <style> blocks', async () => {
		// The resolver reads the authored contract module synchronously, so the
		// same typo that fails the bundler compile fails `analyze` (R5).
		const { root } = project({
			'src/tokens.ts':
				"import { defineThemeTokens } from 'octane/theme-tokens';\n" +
				"export const tokens = defineThemeTokens({ colors: { primary: '#00f' } }, { prefix: 'app' });\n",
			'src/Badge.tsrx':
				"import { tokens } from './tokens';\n" +
				'export function Badge() @{\n' +
				'\t<div>\n' +
				'\t\t<style>.badge { color: var(--app-colors-primay); }</style>\n' +
				'\t\t<span class="badge">hi</span>\n' +
				'\t</div>\n' +
				'}\n',
		});
		const result = await runCli([
			'analyze',
			'--cwd',
			OCTANE,
			path.join(root, 'src/Badge.tsrx'),
			'--json',
		]);

		const [finding] = result.json().findings;
		expect(finding.code).toBe('octane-style-token-undeclared');
		expect(finding.severity).toBe('error');
		expect(finding.message).toContain('--app-colors-primay');
		expect(finding.message).toContain('./tokens');
		expect(result.exitCode).toBe(3);
	});

	it('warns — without failing — when a claimed contract cannot be read', async () => {
		const { root } = project({
			'src/tokens.ts':
				"import { defineThemeTokens } from 'octane/theme-tokens';\n" +
				'declare const dynamic: Record<string, string>;\n' +
				'export const tokens = defineThemeTokens(dynamic);\n',
			'src/Badge.tsrx':
				"import { tokens } from './tokens';\n" +
				'export function Badge() @{\n' +
				'\t<div>\n' +
				'\t\t<style>.badge { color: var(--app-colors-primary); }</style>\n' +
				'\t\t<span class="badge">hi</span>\n' +
				'\t</div>\n' +
				'}\n',
		});
		const result = await runCli([
			'analyze',
			'--cwd',
			OCTANE,
			path.join(root, 'src/Badge.tsrx'),
			'--json',
		]);

		const [finding] = result.json().findings;
		expect(finding.code).toBe('octane-style-token-contract-unresolved');
		expect(finding.severity).toBe('warning');
		expect(result.exitCode).toBe(0);
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
