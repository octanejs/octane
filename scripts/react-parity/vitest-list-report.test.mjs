import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collectVitestTests } from './harness-lib.mjs';

async function fixture(t, body) {
	const root = await mkdtemp(join(tmpdir(), 'vitest-list-fixture-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const directory = join(root, 'node_modules/vitest');
	await mkdir(directory, { recursive: true });
	const file = join(directory, 'vitest.mjs');
	await writeFile(
		file,
		`import { writeFileSync } from 'node:fs';
const report = process.argv[process.argv.indexOf('--json') + 1];
${body}`,
	);
	return { root, file };
}

test('collects exact identities despite browser startup notices', async (t) => {
	const rows = [
		{
			file: '/fixture/browser.test.ts',
			name: 'visible after scrolling',
			projectName: 'browser (chromium)',
		},
	];
	const { root } = await fixture(
		t,
		`console.log('Port 63315 is in use, trying another one...');
writeFileSync(report, ${JSON.stringify(JSON.stringify(rows))});`,
	);
	assert.deepEqual(await collectVitestTests('browser', root), rows);
});

test('does not reuse a previous successful collection when the next report is missing', async (t) => {
	const { root, file } = await fixture(t, `writeFileSync(report, '[]');`);
	assert.deepEqual(await collectVitestTests('browser', root), []);
	await writeFile(file, 'console.log("no report");');
	await assert.rejects(collectVitestTests('browser', root), { code: 'ENOENT' });
});

test('rejects a failed child even when it writes valid identities', async (t) => {
	const { root } = await fixture(t, `writeFileSync(report, '[]'); process.exitCode = 1;`);
	await assert.rejects(collectVitestTests('browser', root));
});

test('rejects malformed structured collection output', async (t) => {
	const { root } = await fixture(t, `writeFileSync(report, 'not JSON');`);
	await assert.rejects(collectVitestTests('browser', root), SyntaxError);
});
