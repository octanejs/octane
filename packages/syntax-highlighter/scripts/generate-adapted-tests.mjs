import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { format, resolveConfig } from 'prettier';
import { verifyGeneratedTree } from './parity-guards.mjs';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const upstreamTests = join(packageRoot, 'upstream', '__tests__');
const outputTests = join(packageRoot, 'tests', 'adapted');
const outputSnapshots = join(outputTests, '__snapshots__');
const generatedTests = join(packageRoot, '.generated-adapted-tests');
const checkOnly = process.argv.includes('--check');
const unexpectedArguments = process.argv.slice(2).filter((argument) => argument !== '--check');
if (unexpectedArguments.length) {
	throw new Error('usage: node scripts/generate-adapted-tests.mjs [--check]');
}
const prettierConfig = (await resolveConfig(packageRoot)) ?? {};

await rm(generatedTests, { recursive: true, force: true });
await mkdir(generatedTests, { recursive: true });

const testFiles = (await readdir(upstreamTests)).filter((name) => name.endsWith('.js')).sort();
for (const name of testFiles) {
	const source = await readFile(join(upstreamTests, name), 'utf8');
	let adapted = `import { expect, test, vi } from 'vitest';\n${source}`
		.replace("import React from 'react';", "import * as React from 'octane';")
		.replace(
			"import renderer from 'react-test-renderer';",
			"import renderer from '../react-test-renderer-adapter.ts';",
		)
		.replace(/from '\.\.\/src/g, "from '../../src")
		.replace(/jest\.fn\(\)/g, 'vi.fn()')
		.replace(/jest\.fn/g, 'vi.fn')
		.replace(/jest\./g, 'vi.');
	if (name === 'light-async.js') {
		const loadingCase = "test('SyntaxHighlighter renders text while language loads', async () => {";
		const loadingCaseIndex = adapted.indexOf(loadingCase);
		const preload = '  await SyntaxHighlighter.preload();';
		const preloadIndex = adapted.indexOf(preload, loadingCaseIndex);
		const assertion = '  expect(tree.toJSON()).toMatchSnapshot();';
		const assertionIndex = adapted.indexOf(assertion, preloadIndex);
		if (loadingCaseIndex === -1 || preloadIndex === -1 || assertionIndex === -1) {
			throw new Error('Unable to stabilize the async loading-state case');
		}
		adapted = `${adapted.slice(0, preloadIndex + preload.length)}

  // Keep the request pending so runner load cannot race the loading-state assertion.
  const loadLanguage = vi
    .spyOn(SyntaxHighlighter, 'loadLanguage')
    .mockImplementation(() => new Promise(() => {}));${adapted.slice(preloadIndex + preload.length, assertionIndex)}  await vi.waitFor(() => expect(loadLanguage).toHaveBeenCalledWith('gherkin'));
${assertion}
  loadLanguage.mockRestore();${adapted.slice(assertionIndex + assertion.length)}`;
	}
	const outputName = name.replace(/\.js$/, '.test.ts');
	const compiled = await transform(adapted, {
		loader: 'jsx',
		format: 'esm',
		target: 'es2022',
		jsxFactory: 'React.createElement',
	});
	await writeFile(
		join(generatedTests, outputName),
		await format(compiled.code, { ...prettierConfig, filepath: outputName }),
	);
}

if (checkOnly) {
	try {
		const retainedTests = join(packageRoot, '.retained-adapted-tests');
		await rm(retainedTests, { recursive: true, force: true });
		await mkdir(retainedTests, { recursive: true });
		for (const name of await readdir(outputTests)) {
			if (name.endsWith('.test.ts')) {
				await writeFile(join(retainedTests, name), await readFile(join(outputTests, name)));
			}
		}
		try {
			await verifyGeneratedTree(generatedTests, retainedTests, 'generated adapted tests');
		} finally {
			await rm(retainedTests, { recursive: true, force: true });
		}
	} finally {
		await rm(generatedTests, { recursive: true, force: true });
	}
} else {
	await mkdir(outputSnapshots, { recursive: true });
	for (const name of await readdir(outputTests)) {
		if (name.endsWith('.test.ts')) await rm(join(outputTests, name));
	}
	for (const name of await readdir(generatedTests)) {
		await writeFile(join(outputTests, name), await readFile(join(generatedTests, name)));
	}
	await rm(generatedTests, { recursive: true, force: true });
}

console.log(
	`${checkOnly ? 'verified' : 'generated'} ${testFiles.length} one-for-one adapted upstream test files`,
);
