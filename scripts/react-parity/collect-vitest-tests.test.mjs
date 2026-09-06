import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { collectVitestTests } from './collect-vitest-tests.mjs';

test('complete Vitest collection retains inherited skips and todo without running test bodies', async (t) => {
	const root = await mkdtemp(join(tmpdir(), 'parity-complete-collection-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await symlink(
		resolve(import.meta.dirname, '../../node_modules'),
		join(root, 'node_modules'),
		'dir',
	);
	await writeFile(
		join(root, 'vitest.config.mjs'),
		`export default { plugins: [{ name: 'collection-diagnostic', configResolved(c) { c.logger.info('collection diagnostic'); } }], test: { name: 'fixture', include: ['suite.test.mjs'], environment: 'node' } };`,
	);
	await writeFile(
		join(root, 'suite.test.mjs'),
		`
import { it, describe } from 'vitest';
it('run', () => { throw new Error('Collection must never execute the test'); });
describe.skip('disabled suite', () => { it('nested', () => {}); });
it.skip('explicit skip', () => {});
it.todo('todo');
it('runtime skip', (ctx) => ctx.skip());
`,
	);
	const tests = await collectVitestTests(root, 'fixture');
	assert.deepEqual(
		tests.map(({ name, mode }) => ({ name, mode })),
		[
			{ name: 'run', mode: 'run' },
			{ name: 'disabled suite > nested', mode: 'skip' },
			{ name: 'explicit skip', mode: 'skip' },
			{ name: 'todo', mode: 'todo' },
			{ name: 'runtime skip', mode: 'run' },
		],
	);
	const { stdout } = await promisify(execFile)(process.execPath, [
		resolve(import.meta.dirname, 'collect-vitest-tests.mjs'),
		root,
		'fixture',
	]);
	assert.deepEqual(JSON.parse(stdout), tests);
});
