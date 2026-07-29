import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixture, runCli } from './helpers/fixture.js';

// `analyze` deliberately compiles with the project's own octane, so the fixture
// borrows a real installed one from this workspace rather than stubbing it: a
// stub would prove nothing about the diagnostics people actually get.
const WORKSPACE = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const OCTANE = path.join(WORKSPACE, 'packages/octane');

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
		expect(report.summary).toEqual({ errors: 1, warnings: 0 });
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

		expect(result.json()).toMatchObject({ ok: true, findings: [] });
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
		const bin = path.join(WORKSPACE, 'packages/cli/src/bin/octane.js');

		const { NODE_PATH: _ignored, ...env } = process.env;
		const result = await promisify(execFile)(process.execPath, [bin, 'analyze', '--cwd', root], {
			env,
		})
			.then(() => ({ code: 0, stderr: '' }))
			.catch((error) => ({ code: error.code, stderr: String(error.stderr) }));

		expect(result.code).toBe(1);
		expect(result.stderr).toMatch(/Could not resolve `octane\/compiler`/);
	});
});
