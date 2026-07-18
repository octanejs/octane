import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../packages/octane/src/compiler/compile.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = join(
	repositoryRoot,
	'packages',
	'octane',
	'audit',
	'native-event-diagnostics.json',
);
const ignoredDirectories = new Set([
	'.git',
	'.turbo',
	'coverage',
	'dist',
	'node_modules',
	'playwright-report',
	'test-results',
]);

// This starter deliberately begins with the React convention. Its prompt,
// reference, source contract, and grader require the author to replace it with
// native onInput wiring; keeping that teaching failure visible is intentional.
const dispositions = new Map([
	[
		'packages/octane/tests/_fixtures/native-change-diagnostics.tsrx',
		'compiler/runtime diagnostic fixture intentionally contains a statically warned native text onChange host',
	],
	[
		'packages/octane-evals/datasets/train/user-apps-v1/tasks/octane.native-controlled-search/starter/src/App.tsrx',
		'eval starter intentionally presents the migration mistake that the task requires fixing',
	],
]);

const sourceExtensions = ['.tsrx', '.tsx', '.jsx'];

function sourceFiles(directory) {
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...sourceFiles(path));
		else if (entry.isFile() && sourceExtensions.some((extension) => entry.name.endsWith(extension)))
			files.push(path);
	}
	return files;
}

function packageMetadata(file) {
	const normalized = relative(repositoryRoot, file).split(sep).join('/');
	const [top, directory] = normalized.split('/');
	if (top === 'packages' && directory) {
		const packageRoot = join(repositoryRoot, top, directory);
		const manifestPath = join(packageRoot, 'package.json');
		const packageName = existsSync(manifestPath)
			? JSON.parse(readFileSync(manifestPath, 'utf8')).name
			: directory;
		return {
			category: existsSync(join(packageRoot, 'status.json')) ? 'binding' : 'package',
			package: packageName,
		};
	}
	if (top === 'website' || top === 'website-mcp') return { category: top, package: null };
	if (top === 'examples') return { category: 'example', package: null };
	if (top === 'benchmarks') return { category: 'benchmark', package: null };
	return { category: 'repository', package: null };
}

const files = sourceFiles(repositoryRoot).sort();
const diagnostics = [];
const failures = [];

for (const file of files) {
	const filename = relative(repositoryRoot, file).split(sep).join('/');
	try {
		const source = readFileSync(file, 'utf8');
		const result = compile(source, filename, { hmr: false });
		for (const diagnostic of result.diagnostics ?? []) {
			const metadata = packageMetadata(file);
			diagnostics.push({
				file: filename,
				...metadata,
				code: diagnostic.code,
				severity: diagnostic.severity,
				line: diagnostic.start.line,
				column: diagnostic.start.column + 1,
				message: diagnostic.message,
				disposition: dispositions.get(filename) ?? 'unclassified',
			});
		}
	} catch (error) {
		failures.push(`${filename}: ${String(error?.message ?? error).split('\n')[0]}`);
	}
}

const unusedDispositions = [...dispositions.keys()].filter(
	(file) => !diagnostics.some((diagnostic) => diagnostic.file === file),
);
const unclassified = diagnostics.filter((diagnostic) => diagnostic.disposition === 'unclassified');
const report = {
	schemaVersion: 2,
	generatedBy: 'pnpm native-events:diagnostics',
	scannedSourceFiles: files.length,
	diagnostics,
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;

if (failures.length > 0) {
	console.error(
		`native-event diagnostic inventory could not compile:\n  - ${failures.join('\n  - ')}`,
	);
	process.exit(1);
}
if (unclassified.length > 0) {
	console.error(
		`native-event diagnostic inventory has unclassified warnings:\n  - ${unclassified
			.map((diagnostic) => `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`)
			.join('\n  - ')}`,
	);
	process.exit(1);
}
if (unusedDispositions.length > 0) {
	console.error(
		`native-event diagnostic inventory has stale dispositions:\n  - ${unusedDispositions.join('\n  - ')}`,
	);
	process.exit(1);
}

if (process.argv.includes('--check')) {
	if (!existsSync(outputPath) || readFileSync(outputPath, 'utf8') !== serialized) {
		console.error(
			'packages/octane/audit/native-event-diagnostics.json is stale; run `pnpm native-events:diagnostics`',
		);
		process.exit(1);
	}
	console.log(
		`native-event diagnostic inventory is current (${files.length} JSX/TSRX files, ${diagnostics.length} classified warning)`,
	);
} else {
	writeFileSync(outputPath, serialized);
	console.log(
		`wrote ${relative(repositoryRoot, outputPath)} (${files.length} JSX/TSRX files, ${diagnostics.length} classified warning)`,
	);
}
