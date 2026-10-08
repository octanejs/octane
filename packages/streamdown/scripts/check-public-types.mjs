import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { importNativeTypeScript } from '../../../scripts/octane-tsc/native.mjs';

const { API } = await importNativeTypeScript('unstable/sync');

const packageRoot = resolve(import.meta.dirname, '..');
const configPath = resolve(packageRoot, 'tsconfig.json');
const containingFile = resolve(packageRoot, 'tests/types/public-api.test-d.ts');
const entries = [
	{
		name: 'root',
		localFile: resolve(packageRoot, 'src/index.tsrx.d.ts'),
		upstream: 'streamdown',
	},
	{
		name: 'code',
		localFile: resolve(packageRoot, 'src/code.ts'),
		upstream: '@streamdown/code',
	},
	{
		name: 'math',
		localFile: resolve(packageRoot, 'src/math.ts'),
		upstream: '@streamdown/math',
	},
	{
		name: 'mermaid',
		localFile: resolve(packageRoot, 'src/mermaid-plugin.ts'),
		upstream: '@streamdown/mermaid',
	},
	{
		name: 'cjk',
		localFile: resolve(packageRoot, 'src/cjk.ts'),
		upstream: '@streamdown/cjk',
	},
];

// TypeScript 7 resolves a module specifier written in a program file, so a
// virtual module at the type tests' location imports each upstream entry point.
// It reaches TypeScript through the API's file system callbacks, never the disk.
const importer = resolve(dirname(containingFile), `.public-types-${process.pid}.ts`);
const importerText = entries
	.map((entry, index) => `import * as entry${index} from ${JSON.stringify(entry.upstream)};`)
	.join('\n');
const api = new API({
	cwd: packageRoot,
	fs: {
		readFile: (fileName) => (fileName === importer ? importerText : undefined),
		fileExists: (fileName) => (fileName === importer ? true : undefined),
	},
});

try {
	const config = api.readConfigFile(configPath);
	if (config.error) throw new Error(config.error.text);
	const parsed = api.parseJsonConfigFileContent(config.config, { configDirectory: packageRoot });
	const program = api.createProgram(
		[...parsed.fileNames, ...entries.map((entry) => entry.localFile), importer],
		parsed.options,
	);
	const { checker } = program.getProject();

	const resolvedUpstream = new Map(
		program.getSourceFile(importer).statements.map((statement, index) => {
			const { upstream } = entries[index];
			const resolved = program.getResolvedModuleFromModuleSpecifier(
				statement.moduleSpecifier,
				importer,
			);
			assert.ok(resolved, `Unable to resolve ${upstream}`);
			return [upstream, resolved.resolvedFileName];
		}),
	);

	function exportNames(file) {
		const sourceFile = program.getSourceFile(file);
		assert.ok(sourceFile, `TypeScript program omitted ${file}`);
		const symbol = checker.getSymbolOfSourceFile(file);
		assert.ok(symbol, `TypeScript module has no symbol: ${file}`);
		return checker
			.getExportsOfModule(symbol)
			.map((entry) => entry.name)
			.sort();
	}

	for (const entry of entries) {
		assert.deepEqual(
			exportNames(entry.localFile),
			exportNames(resolvedUpstream.get(entry.upstream)),
			`${entry.name} public TypeScript exports differ from ${entry.upstream}`,
		);
	}

	console.log('Streamdown public TypeScript exports match the root and four plugin entry points.');
} finally {
	api.close();
}
