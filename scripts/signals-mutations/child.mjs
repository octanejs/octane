import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startVitest } from 'vitest/node';
import { scopedSignalsProjects } from '../scoped-signals-projects.mjs';
import { realFile } from './runner.mjs';

const [requestFile, reportFile] = process.argv.slice(2);
const request = JSON.parse(await readFile(requestFile, 'utf8'));
const { root, row, phase, nonce, testMutation } = request;
const sourceFile = realFile(resolve(root, row.file));
const testFile = realFile(resolve(root, row.testFile));
const report = { version: 1, nonce, row: row.id, phase, transforms: [], tests: [], errors: [] };
const serialized = (error) => ({
	name: error.name,
	message: error.message,
	firstFile: realFile(error.stacks?.[0]?.file),
});
// A thrown Vitest hook can remain "run" rather than becoming "fail".
const hookFailed = (task) =>
	Object.values(task.result?.hooks ?? {}).some((state) => state !== 'pass');
let vitest;
try {
	if (!sourceFile || !testFile) throw new Error('Mutation source and test must exist');
	const { octane } = await import('../../packages/octane/src/compiler/vite.js');
	const project = scopedSignalsProjects(octane).find(
		(project) => project.test.name === row.project,
	);
	if (!project || row.project === 'octane-signals-mutations' || project.testExecution?.group)
		throw new Error(`Unsupported mutation project: ${row.project}`);
	const plugin = {
		name: 'octane-signals-mutation',
		enforce: 'pre',
		transform(code, id) {
			const file = realFile(id);
			if (file === sourceFile) {
				const matches = code.split(row.find).length - 1;
				report.transforms.push({ file, matches });
				if (matches !== 1)
					throw new Error(`Mutation ${row.id}: expected one source match, received ${matches}`);
				if (phase === 'mutant') return code.replace(row.find, row.replace);
				if (phase === 'noop') return code;
			}
			// Only runner negative controls use a test transform. Never write source files.
			if (testMutation && file === testFile) {
				if (code.split(testMutation.find).length !== 2)
					throw new Error('Negative-control test transform must match once');
				return code.replace(testMutation.find, testMutation.replace);
			}
		},
	};
	const reporter = {
		onTestCaseReady(test) {
			if (row.tests.includes(test.fullName))
				process.send?.({ nonce, type: 'test-started', id: test.id });
		},
		onTestRunEnd(modules, unhandledErrors, reason) {
			report.reason = reason;
			report.errors.push(...unhandledErrors.map(serialized));
			for (const module of modules) {
				report.errors.push(...module.errors().map(serialized));
				for (const suite of module.children.allSuites()) {
					report.errors.push(...suite.errors().map(serialized));
					if (hookFailed(suite.task)) report.errors.push({ name: 'HookError' });
				}
				if (hookFailed(module.task)) report.errors.push({ name: 'HookError' });
				for (const test of module.children.allTests()) {
					const result = test.result();
					const diagnostic = test.diagnostic();
					report.tests.push({
						id: test.id,
						name: test.fullName,
						project: test.project.name,
						file: realFile(module.moduleId),
						state: result.state,
						errors: (result.errors ?? []).map(serialized),
						hookFailed: hookFailed(test.task),
						retryCount: diagnostic?.retryCount ?? 0,
						repeatCount: diagnostic?.repeatCount ?? 0,
						flaky: diagnostic?.flaky ?? false,
					});
				}
			}
		},
	};
	const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	vitest = await startVitest(
		'test',
		[row.testFile],
		{
			...project.test,
			root,
			config: false,
			watch: false,
			pool: 'threads',
			maxWorkers: 1,
			testTimeout: 10_000,
			hookTimeout: 10_000,
			include: [row.testFile],
			testNamePattern: `^(?:${row.tests.map((name) => escape(name.replaceAll(' > ', ' '))).join('|')})$`,
			reporters: [reporter],
		},
		{ plugins: [plugin, ...(project.plugins ?? [])] },
	);
} catch (error) {
	report.runnerError = { name: error.name, message: error.message };
	process.exitCode = 1;
} finally {
	try {
		await vitest?.close();
	} catch (error) {
		report.runnerError = { name: error.name, message: error.message };
		process.exitCode = 1;
	}
	await writeFile(reportFile, JSON.stringify(report));
	if (process.connected) process.disconnect();
}
