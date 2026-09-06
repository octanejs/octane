import assert from 'node:assert/strict';
import { mkdtemp, realpath, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'vitest';
import { createVitest } from 'vitest/node';

test('browser collection releases a file mock before collecting an unmocked consumer', async (t) => {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'parity-browser-collection-')));
	t.onTestFinished(() => rm(root, { recursive: true, force: true }));
	await symlink(resolve(import.meta.dirname, '../node_modules'), join(root, 'node_modules'), 'dir');
	await writeFile(
		join(root, 'vitest.config.mjs'),
		`
import { playwright } from '@vitest/browser-playwright';
export default { test: {
  name: 'collection', include: ['*.test.mjs'], fileParallelism: false,
  browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'chromium' }] }
} };
`,
	);
	await writeFile(join(root, 'dependency.mjs'), `export const value = 'original';`);
	await writeFile(
		join(root, 'mocked.test.mjs'),
		`
import { it, vi } from 'vitest';
import { value } from './dependency.mjs';
vi.mock('./dependency.mjs', () => ({ value: 'mocked' }));
if (value !== 'mocked') throw new Error('The first file must see its own mock');
it('mocked', () => { throw new Error('Collection must not execute test bodies'); });
`,
	);
	await writeFile(
		join(root, 'unmocked.test.mjs'),
		`
import { it } from 'vitest';
import { value } from './dependency.mjs';
if (value !== 'original') throw new Error('The second file must see the original module');
it('unmocked', () => { throw new Error('Collection must not execute test bodies'); });
`,
	);
	const ctx = await createVitest('test', { root, watch: false, reporters: [], silent: true });
	try {
		const specifications = await ctx.globTestSpecifications();
		const collected: string[] = [];
		for (const name of ['mocked.test.mjs', 'unmocked.test.mjs']) {
			const specification = specifications.find((spec) => spec.moduleId === join(root, name));
			assert.ok(specification, `${name} must be selected`);
			const result = await ctx.collectTests([specification]);
			assert.deepEqual(result.unhandledErrors, []);
			const modules = result.testModules.filter(
				(module) => module.moduleId === specification.moduleId,
			);
			assert.equal(modules.length, 1);
			for (const module of modules) {
				assert.deepEqual(module.errors(), []);
				collected.push(...[...module.children.allTests()].map((entry) => entry.fullName));
			}
		}
		assert.deepEqual(collected, ['mocked', 'unmocked']);
		const { default: ParityReporter } =
			await import('../scripts/react-parity/vitest-json-reporter.mjs');
		const reportFile = join(root, 'collection-report.json');
		const reporter = new ParityReporter({ outputFile: reportFile });
		reporter.onInit(ctx);
		await reporter.onTestRunEnd([...ctx.state.getTestModules()]);
		const report = JSON.parse(await readFile(reportFile, 'utf8'));
		assert.deepEqual(
			report.testResults.map((suite: { projectName: string }) => suite.projectName),
			['collection', 'collection'],
		);
	} finally {
		await ctx.close();
	}
});
