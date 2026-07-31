import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import ts from 'typescript';

const packageRoot = resolve(import.meta.dirname, '..');
const configPath = resolve(packageRoot, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error) {
	throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
}

const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, packageRoot);
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

const resolvedUpstream = new Map(
	entries.map((entry) => {
		const resolved = ts.resolveModuleName(
			entry.upstream,
			containingFile,
			parsed.options,
			ts.sys,
		).resolvedModule;
		assert.ok(resolved, `Unable to resolve ${entry.upstream}`);
		return [entry.upstream, resolved.resolvedFileName];
	}),
);

const program = ts.createProgram(
	[...parsed.fileNames, ...entries.map((entry) => entry.localFile), ...resolvedUpstream.values()],
	parsed.options,
);
const checker = program.getTypeChecker();

function exportNames(file) {
	const sourceFile = program.getSourceFile(file);
	assert.ok(sourceFile, `TypeScript program omitted ${file}`);
	const symbol = checker.getSymbolAtLocation(sourceFile);
	assert.ok(symbol, `TypeScript module has no symbol: ${file}`);
	return checker
		.getExportsOfModule(symbol)
		.map((entry) => entry.getName())
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
