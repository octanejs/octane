// Targeted publication check. This uses the package's actual per-file builders,
// but does not stand in for the compiler/Volar build or a full pnpm pack.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPackageCommonjs } from '../../scripts/build-package-commonjs.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const option = (name) => {
	const index = args.indexOf(name);
	return index < 0 ? undefined : args[index + 1];
};
const toolingRoot = resolve(option('--tooling-root') ?? repo);
const output = option('--output');
if (!output) throw new Error('Pass --output <report.json>; --tooling-root is optional.');
const requireTool = createRequire(join(toolingRoot, 'package.json'));
const esbuild = requireTool('esbuild');
const ts = requireTool('typescript');
assert.equal(esbuild.version, '0.28.1');
assert.equal(ts.version, '5.9.3');

function packageFor(specifier) {
	let directory = dirname(requireTool.resolve(specifier));
	while (!existsSync(join(directory, 'package.json'))) {
		const parent = dirname(directory);
		if (parent === directory) throw new Error(`No package metadata for ${specifier}`);
		directory = parent;
	}
	return { directory, manifest: JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) };
}
const alien = packageFor('alien-signals');
assert.equal(alien.manifest.version, '3.2.0');

const scratch = mkdtempSync(join(tmpdir(), 'octane-signals-package-'));
const packageDir = join(scratch, 'package');
const sourcePackageDir = join(repo, 'packages/octane');
mkdirSync(packageDir);
cpSync(join(sourcePackageDir, 'src'), join(packageDir, 'src'), { recursive: true });
const manifest = JSON.parse(readFileSync(join(sourcePackageDir, 'package.json'), 'utf8'));
writeFileSync(
	join(packageDir, 'package.json'),
	JSON.stringify({ ...manifest, ...manifest.publishConfig }),
);
symlinkSync(join(toolingRoot, 'node_modules'), join(packageDir, 'node_modules'));

const sourceInputs = readdirSync(join(packageDir, 'src'), { recursive: true })
	.filter((path) => /\.(?:js|ts)$/.test(path))
	.sort()
	.map((path) => ({
		path: `packages/octane/src/${path.split(sep).join('/')}`,
		sha256: createHash('sha256')
			.update(readFileSync(join(packageDir, 'src', path)))
			.digest('hex'),
	}));
for (const path of [
	'packages/octane/package.json',
	'packages/octane/scripts/build.mjs',
	'scripts/build-package-commonjs.mjs',
	'benchmarks/scoped-signals/package-smoke.mjs',
]) {
	sourceInputs.push({
		path,
		sha256: createHash('sha256')
			.update(readFileSync(join(repo, path)))
			.digest('hex'),
	});
}

const src = join(packageDir, 'src');
const dist = join(packageDir, 'dist');
const entryPoints = readdirSync(src, { recursive: true })
	.filter(
		(file) =>
			(file.endsWith('.ts') || file.endsWith('.js')) &&
			!file.endsWith('.d.ts') &&
			!file.startsWith(`compiler${sep}`),
	)
	.map((file) => join(src, file));
await esbuild.build({
	entryPoints,
	outdir: dist,
	outbase: src,
	format: 'esm',
	platform: 'neutral',
	target: 'esnext',
	bundle: false,
});

// Read the entry list from the real build script; a missing emitted entry must
// fail this probe instead of being quietly added by the validation harness.
const buildSource = readFileSync(join(sourcePackageDir, 'scripts/build.mjs'), 'utf8');
const list = /await buildPackageCommonjs\(\{[\s\S]*?entries:\s*\[([\s\S]*?)\]/.exec(
	buildSource,
)?.[1];
assert.ok(list, 'Cannot locate the package CommonJS entry list');
const commonjsEntries = [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);
const commonjs = await buildPackageCommonjs({
	packageDir,
	entries: commonjsEntries,
	outdir: 'dist/cjs',
	sourceRoot: 'src',
});

const declarationEntries = [
	'src/index.ts',
	'src/server/index.ts',
	'src/signals/index.ts',
	'src/signals/client.ts',
	'src/signals/server.ts',
	'src/internal/client.ts',
	'src/internal/server.ts',
];
const compilerOptions = {
	target: ts.ScriptTarget.ESNext,
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	strict: true,
	verbatimModuleSyntax: true,
	resolveJsonModule: true,
	allowSyntheticDefaultImports: true,
	declaration: true,
	emitDeclarationOnly: true,
	noEmitOnError: true,
	rootDir: src,
	outDir: dist,
	typeRoots: [join(toolingRoot, 'node_modules/@types')],
	types: ['node'],
	lib: ['lib.esnext.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
};
const program = ts.createProgram(
	declarationEntries.map((entry) => join(packageDir, entry)),
	compilerOptions,
);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length)
	throw new Error(
		ts.formatDiagnosticsWithColorAndContext(diagnostics, {
			getCurrentDirectory: () => packageDir,
			getCanonicalFileName: (file) => file,
			getNewLine: () => '\n',
		}),
	);
assert.equal(program.emit().emitSkipped, false);
cpSync(join(src, 'dom-tables.d.ts'), join(dist, 'dom-tables.d.ts'));

const sharedRuntimeProbe = `
const scope = signals.createScope({scopeKey: 'published-native'});
const value$ = scope.signal$('value', 3);
const doubled$ = scope.derived$('doubled', () => value$.get() * 2);
assert.equal(doubled$.get(), 6);
let notifications = 0;
const stop = doubled$.subscribe(() => notifications++);
scope.batch(() => { value$.set(4); value$.set(5); });
assert.equal(doubled$.get(), 10);
assert.equal(notifications, 1);
let escaped;
internalServer.enableNativeReadCollection(1);
function Component({ value = doubled$.get() } = {}) {
  escaped = serverHooks.useSignal$(2);
  return '<p>' + value + ':' + escaped.get() + '</p>';
}
const output = server.renderToString(Component);
assert.ok(output.html.includes('<p>10:2</p>'));
const normalizeSeed = (seed) => ({...seed, entries:[...seed.entries].sort((a, b) => a.key.localeCompare(b.key))});
assert.deepEqual(output.signals?.scopes.map(normalizeSeed), [normalizeSeed(scope.serialize())]);
assert.throws(() => escaped.get(), signals.ScopeDisposedError);
assert.equal(typeof clientHooks.useSignal$, 'function');
assert.equal(typeof client.createRoot, 'function');
assert.equal(typeof internalClient.enableNativeReadCollection, 'function');
assert.equal(typeof internalClient.beginNativeReadScope, 'function');
stop();
scope.dispose();
process.stdout.write(JSON.stringify({html: true, seed: true, invocationCollector: true, localRetired: true, notifications}));
`;
const namespaces = {
	client: 'octane',
	server: 'octane/server',
	signals: 'octane/signals',
	clientHooks: 'octane/signals/client',
	serverHooks: 'octane/signals/server',
	internalClient: 'octane/internal/client',
	internalServer: 'octane/internal/server',
};
const probes = [];
for (const mode of ['esm', 'cjs']) {
	const imports =
		mode === 'esm'
			? `import assert from 'node:assert/strict';\n${Object.entries(namespaces)
					.map(([name, specifier]) => `import * as ${name} from '${specifier}';`)
					.join('\n')}`
			: `const assert = require('node:assert/strict');\n${Object.entries(namespaces)
					.map(([name, specifier]) => `const ${name} = require('${specifier}');`)
					.join('\n')}`;
	const probeFile = join(packageDir, `probe.${mode === 'esm' ? 'mjs' : 'cjs'}`);
	writeFileSync(probeFile, imports + sharedRuntimeProbe);
	const result = execFileSync(process.execPath, [probeFile], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit'],
		timeout: 10_000,
	});
	probes.push({ mode, ...JSON.parse(result) });
}

const typeConsumer = join(packageDir, 'consumer.mts');
writeFileSync(
	typeConsumer,
	`import { createScope, query, type SignalHandle, type WritableSignal, type ScopeSeed } from 'octane/signals';
import { useSignal$ } from 'octane/signals/client';
import { useSignal$ as useServerSignal$ } from 'octane/signals/server';
const owner = createScope({scopeKey:'types'});
const count$ = owner.signal$('count', 1);
const count: number = count$.get();
const derived$ = owner.derived$('derived', () => count$.get() + 1);
const resource$ = owner.asyncSignal$('resource', () => query('load', async (x: number) => String(x))(count));
const text: string = resource$.get();
const local: WritableSignal<number> = useSignal$(1);
const server: WritableSignal<string> = useServerSignal$(() => 'ready');
const seed: ScopeSeed = owner.serialize();
// @ts-expect-error The handle keeps its value type.
const wrong: WritableSignal<string> = count$;
// @ts-expect-error Derived callbacks are synchronous.
owner.derived$('invalid', async () => 1);
// @ts-expect-error A structural lookalike is not a branded signal handle.
const lookalike: SignalHandle<number> = {key:'fake',get:()=>1,latest:()=>1,snapshot:()=>({status:'ready',value:1,complete:true,refreshing:false,connection:'none'}),subscribe:()=>()=>{}};
void [derived$, text, local, server, seed, wrong, lookalike];
`,
);
const consumerProgram = ts.createProgram([typeConsumer], {
	...compilerOptions,
	declaration: false,
	emitDeclarationOnly: false,
	noEmit: true,
	rootDir: packageDir,
});
const consumerDiagnostics = ts.getPreEmitDiagnostics(consumerProgram);
assert.deepEqual(
	consumerDiagnostics.map((diagnostic) =>
		ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
	),
	[],
);

const report = {
	version: 1,
	measuredAt: new Date().toISOString(),
	node: process.version,
	toolingRoot,
	tools: { esbuild: esbuild.version, typescript: ts.version, alienSignals: alien.manifest.version },
	scratch,
	status: 'passed',
	scope:
		'Targeted per-file ESM/CommonJS public imports, native SSR invocation/parameter collection and protocol identity, local hook retirement, and declaration consumer. Compiler/Volar build and full package tarball not verified.',
	commonjsEntries,
	commonjsModules: commonjs.modules,
	declarationEntries,
	probes,
	typeConsumer: 'passed',
	sourceInputs,
};
mkdirSync(dirname(resolve(output)), { recursive: true });
writeFileSync(resolve(output), JSON.stringify(report, null, 2) + '\n');
console.log(`Published scoped-signal entry checks passed; ${relative(repo, resolve(output))}`);
