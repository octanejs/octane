import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { digest, keep, toolchain, tree } from '../signal-chat-route/evidence.mjs';

const repo = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build, version } = await import(pathToFileURL(require.resolve('vite')).href);
const source = path.join(repo, 'examples/signal-chat');
const output = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'octane-metrics-binding-')));
const root = path.join(output, 'project');
const shared = path.resolve(import.meta.dirname, '../metrics-shared-view');
const sharedNames = ['Metrics.tsrx', 'MetricsFrame.tsrx'];
const overlay = path.join(import.meta.dirname, 'overlay');
const overlayNames = [
	'Metrics.tsrx',
	'MetricsActions.tsrx',
	'metrics-projection.ts',
	'candidate-adapter.tsrx',
	'candidate-controller.ts',
	'candidate-activator.ts',
];
const sharedInputs = Object.fromEntries(
	sharedNames.map((name) => [name, digest(fs.readFileSync(path.join(shared, name)))]),
);
const sourceBefore = tree(source);
assert.equal(
	digest(JSON.stringify(sourceBefore)),
	'5dd762d9b50a9f933d6a90ede20e52dd0e6d18a603f79f27b8237c514c1d5d0d',
	'Signal Chat changed; reassess this manually gated checkpoint before rebuilding',
);
const toolchainBefore = toolchain(repo);
// The unchanged behavior driver verifies these inputs relative to its own directory.
const experimentFiles = ['build.mjs', 'browser.mjs'];
const experiment = Object.fromEntries(
	experimentFiles.map((file) => [
		file,
		digest(fs.readFileSync(path.join(import.meta.dirname, '../islands-first', file))),
	]),
);
const candidateInputs = Object.fromEntries(
	['build.mjs', 'graph.mjs', ...overlayNames.map((name) => `overlay/${name}`)].map((file) => [
		file,
		digest(fs.readFileSync(path.join(import.meta.dirname, file))),
	]),
);
assert.deepEqual(
	Object.keys(tree(overlay, new Set())).sort(),
	[...overlayNames].sort(),
	'Unexpected candidate overlay input',
);
fs.cpSync(source, root, { recursive: true, filter: keep });
assert.deepEqual(tree(root), sourceBefore, 'The copied Signal Chat source must match');
for (const name of sharedNames)
	fs.copyFileSync(path.join(shared, name), path.join(root, 'src', name));
for (const name of overlayNames)
	fs.copyFileSync(path.join(overlay, name), path.join(root, 'src', name));
const expectedProject = { ...sourceBefore };
for (const name of sharedNames) expectedProject[`src/${name}`] = sharedInputs[name];
for (const name of overlayNames)
	expectedProject[`src/${name}`] = candidateInputs[`overlay/${name}`];
assert.deepEqual(
	tree(root),
	expectedProject,
	'The copied source must match the frozen inputs and declared overlay',
);
fs.mkdirSync(path.join(root, 'node_modules/@octanejs'), { recursive: true });
for (const name of ['octane', '@octanejs/app-core', '@octanejs/vite-plugin']) {
	fs.symlinkSync(
		fs.realpathSync(path.join(source, 'node_modules', name)),
		path.join(root, 'node_modules', name),
		'dir',
	);
}
fs.symlinkSync(
	fs.realpathSync(path.join(repo, 'node_modules/vite')),
	path.join(root, 'node_modules/vite'),
	'dir',
);

function replaceOnce(code, from, to) {
	assert.equal(code.split(from).length, 2, `Expected one generated bootstrap site: ${from}`);
	return code.replace(from, to);
}
let transformed = 0;
let originalBootstrapSha256;
let clientManifest;
let metricsReference;
let metricsEmittedFile;
let metricsCompiledSha256;
let metricsCompiledCount = 0;
const checkpoint = {
	name: 'signal-chat-islands-first-checkpoint',
	enforce: 'post',
	apply: 'build',
	buildStart() {
		if (this.environment?.config?.consumer === 'server') return;
		metricsReference = this.emitFile({
			type: 'chunk',
			id: path.join(root, 'src/App.tsrx') + '?octane-hydrate=4',
			name: 'benchmark-original-metrics',
			preserveSignature: 'strict',
		});
	},
	resolveId(id) {
		if (id === 'virtual:ordinary-root-fallback') return '\0virtual:ordinary-root-fallback';
		if (id === 'virtual:metrics-binding-candidate')
			return path.join(root, 'src/candidate-activator.ts');
		if (id === 'virtual:ordinary-metrics-activator')
			return path.join(root, 'src/App.tsrx') + '?octane-hydrate=4';
	},
	load(id) {
		if (id === '\0virtual:ordinary-root-fallback')
			return "export { hydrateRoot, Suspense, ErrorBoundary, createElement } from 'octane';";
	},
	transform(code, id, options) {
		if (options?.ssr || this.environment?.config?.consumer === 'server') return null;
		if (id === path.join(root, 'src/App.tsrx') + '?octane-hydrate=4') {
			assert.ok(code.includes('Metrics.tsrx'), 'Expected the compiled Metrics activation');
			metricsCompiledCount++;
			metricsCompiledSha256 = digest(code);
			return null;
		}
		if (id !== '\0virtual:octane-hydrate') return null;
		transformed++;
		assert.ok(metricsReference, 'Missing emitted original Metrics reference');
		originalBootstrapSha256 = digest(code);
		code = replaceOnce(
			code,
			'import { hydrateRoot, initializeHydrationEventCapture, Suspense, ErrorBoundary, createElement } from "octane";',
			`import { initializeHydrationEventCapture } from 'octane/hydration';
let hydrateRoot, Suspense, ErrorBoundary, createElement;`,
		);
		// This is an experiment against this one route, not an eligibility proof.
		// Select before the shared registry begins so fallback never starts a second one.
		code = replaceOnce(
			code,
			'      return loader ? loader() : dynamicImport(clientAssetPath(moduleId));',
			`      const metricUrl = new URL(import.meta.ROLLUP_FILE_URL_${metricsReference}, import.meta.url).href;
      const requestedUrl = new URL(clientAssetPath(moduleId), globalThis.location.href).href;
      const checkpoint = globalThis.__octaneIslandsFirstCheckpoint;
      const isMetrics = requestedUrl === metricUrl;
      const selected = checkpoint?.selection === 'islands-first' &&
        new URL(globalThis.location.href).searchParams.get('__bindingMetrics') === '1';
      if (selected && isMetrics && (typeof clientBuildId !== 'string' || !clientBuildId || signalOwner === undefined)) {
        checkpoint.metricsChoice = 'ordinary';
        checkpoint.metricsSelectionError = 'Missing document build identity or signal owner';
        return loader ? loader() : dynamicImport(clientAssetPath(moduleId));
      }
      if (selected && isMetrics) {
        checkpoint.metricsModuleId = moduleId;
        checkpoint.metricsModuleUrl = metricUrl;
        checkpoint.metricsClientBuildId = clientBuildId;
        checkpoint.metricsChoice = 'pending';
        return import('virtual:metrics-binding-candidate').then(async (binding) => {
          let useBinding = false;
          try {
            if (typeof binding.default === 'function' && typeof binding.selectMetricsBinding === 'function')
              useBinding = await binding.selectMetricsBinding() === true;
          } catch (error) {
            checkpoint.metricsSelectionError = String(error);
          }
          checkpoint.metricsChoice = useBinding ? 'binding' : 'ordinary';
          return useBinding ? binding : (loader ? loader() : dynamicImport(clientAssetPath(moduleId)));
        }, (error) => {
          checkpoint.metricsSelectionError = String(error);
          checkpoint.metricsChoice = 'ordinary';
          return loader ? loader() : dynamicImport(clientAssetPath(moduleId));
        });
      }
      if (isMetrics && checkpoint) checkpoint.metricsChoice = 'ordinary';
      return loader ? loader() : dynamicImport(clientAssetPath(moduleId));`,
		);
		code = replaceOnce(
			code,
			'    await bootstrapIndependentIslands(target);',
			`    const forcedOrdinary = new URL(globalThis.location.href).searchParams.has('__ordinaryRoot');
    const eligible = data.entry === '/src/App.tsrx' && data.exportName === 'App' &&
      data.preHydrate === '/src/pre-hydrate.ts' && !data.layout &&
      !data.rootBoundary?.pending && !data.rootBoundary?.catch &&
      globalThis.location.pathname === '/' && !!data.streamedSignals &&
      !!target.querySelector('[data-lab-shell][data-activation="interaction"]');
    const checkpoint = globalThis.__octaneIslandsFirstCheckpoint = {
      selection: eligible && !forcedOrdinary ? 'islands-first' : 'ordinary',
      forcedOrdinary, eligible, registryStarts: 0, rootHydrateCalls: 0,
      hasSignalOwner: signalOwner !== undefined, hasStreamReceiver: streamedHydration !== undefined,
      preHydrateCompleted: false,
    };
    if (checkpoint.selection === 'ordinary') {
      const rootRuntime = await import('virtual:ordinary-root-fallback');
      if (incompatibleBuild) return;
      if (documentLifecycle && !await documentLifecycle.whenActive()) return;
      ({ hydrateRoot, Suspense, ErrorBoundary, createElement } = rootRuntime);
    }
    checkpoint.registryStarts++;
    await bootstrapIndependentIslands(target);
    checkpoint.hasSignalOwner = signalOwner !== undefined;
    checkpoint.hasStreamReceiver = streamedHydration !== undefined;`,
		);
		code = replaceOnce(
			code,
			'    const pageMod = await importModule(data.entry);',
			`    if (checkpoint.selection === 'islands-first') {
      // Preserve the authored hook and its lifecycle checks; it no longer gates
      // composed-root hydration because that hydration is deliberately skipped.
      const preMod = await importModule(data.preHydrate);
      if (incompatibleBuild) return;
      if (documentLifecycle && !await documentLifecycle.whenActive()) return;
      if (typeof preMod.default !== 'function') throw new Error('Missing preHydrate hook');
      await preMod.default({ url: data.url, params: data.params });
      checkpoint.preHydrateCompleted = true;
      return;
    }
    const pageMod = await importModule(data.entry);`,
		);
		code = replaceOnce(
			code,
			'    hydrateRoot(target, withRootBoundary(Content, rootBoundary), undefined,',
			`    checkpoint.preHydrateCompleted = true;
    checkpoint.rootHydrateCalls++;
    hydrateRoot(target, withRootBoundary(Content, rootBoundary), undefined,`,
		);
		return { code, map: null };
	},
	writeBundle(_options, bundle) {
		if (this.environment?.config?.consumer === 'server') return;
		metricsEmittedFile = this.getFileName(metricsReference);
		const asset = bundle['.vite/manifest.json'];
		assert.ok(asset && asset.type === 'asset', 'Expected the Vite client manifest');
		clientManifest = String(asset.source);
	},
};
await build({
	root,
	configFile: path.join(root, 'vite.config.ts'),
	mode: 'production',
	plugins: [checkpoint],
});
assert.equal(transformed, 1, 'Expected exactly one client bootstrap transform');
assert.equal(metricsCompiledCount, 1, 'Expected exactly one original Metrics compilation');
assert.ok(clientManifest, 'Client manifest was not captured');
const manifest = JSON.parse(clientManifest);
const pageFile = manifest['src/App.tsrx']?.file;
assert.ok(pageFile, 'Expected the default route page file');
const serverFile = path.join(root, 'dist/server/entry.js');
const originalServer = fs.readFileSync(serverFile, 'utf8');
const originalServerSha256 = digest(originalServer);
const headSite =
	'\t\tconst headContent = assetHead === "" ? dataScript : assetHead + "\\n" + dataScript;';
const patchedServer = replaceOnce(
	originalServer,
	headSite,
	`\t\tif (context.url.pathname === '/' && !context.url.searchParams.has('__ordinaryRoot') &&
\t\t\tentryPath === '/src/App.tsrx' && exportName === 'App' && !route.layout &&
\t\t\tmanifest.preHydrate === '/src/pre-hydrate.ts' && !manifest.rootBoundary?.pending && !manifest.rootBoundary?.catch) {
\t\t\tconst preload = '<link rel="modulepreload" href="/' + manifest.clientAssets[entryPath].js + '">';
\t\t\tif (manifest.clientAssets[entryPath].js !== ${JSON.stringify(pageFile)} || assetHead.split(preload).length !== 2)
\t\t\t\tthrow new Error('Benchmark: expected one default-route page preload');
\t\t\tassetHead = assetHead.replace(preload, '');
\t\t}
${headSite}`,
);
fs.writeFileSync(serverFile, patchedServer);
assert.deepEqual(tree(source), sourceBefore, 'The original app changed during the build');
assert.deepEqual(tree(root), expectedProject, 'The copied app source changed during the build');
for (const name of sharedNames)
	assert.equal(
		digest(fs.readFileSync(path.join(shared, name))),
		sharedInputs[name],
		`${name} changed during build`,
	);
for (const [name, hash] of Object.entries(candidateInputs))
	assert.equal(
		digest(fs.readFileSync(path.join(import.meta.dirname, name))),
		hash,
		`${name} changed during build`,
	);
assert.deepEqual(
	toolchain(repo),
	toolchainBefore,
	'Selected toolchain sources changed during the build',
);
const independent = JSON.parse(
	fs.readFileSync(path.join(root, 'dist/server/octane-independent-hydration.json'), 'utf8'),
);
const widgets = Object.values(independent.widgets);
assert.equal(widgets.length, 5, 'Expected the five original independent entries');
assert.equal(
	metricsEmittedFile,
	manifest['src/App.tsrx?octane-hydrate=4']?.file,
	'Emitted Metrics reference differs from the Vite manifest',
);
const metricWidgets = widgets.filter((widget) => widget.moduleId === metricsEmittedFile);
assert.equal(metricWidgets.length, 1, 'Expected exactly one Metrics manifest record');
assert.deepEqual(
	metricWidgets[0],
	{
		version: 1,
		boundaryId: 'w:78c36f23',
		moduleId: metricsEmittedFile,
		exportName: 'default',
		captureSchema: [],
		hookSeed: 3456549929,
		idSeed: 750830155,
		signalSites: [],
		styles: [],
		parentDependencies: false,
	},
	'The pinned Metrics site or its activation contract changed',
);
for (const widget of widgets)
	assert.ok(
		Object.values(manifest).some((entry) => entry.file === widget.moduleId),
		'Missing emitted island',
	);
const artifactFiles = tree(path.join(root, 'dist'), new Set());
const report = {
	output,
	node: process.version,
	vite: version,
	source: sourceBefore,
	sourceSha256: digest(JSON.stringify(sourceBefore)),
	projectSource: expectedProject,
	sharedInputs,
	toolchain: toolchainBefore,
	toolchainSha256: digest(JSON.stringify(toolchainBefore)),
	experiment,
	candidateInputs,
	originalBootstrapSha256,
	metricsCompiledSha256,
	metricsEmittedFile,
	originalServerSha256,
	patchedServerSha256: digest(patchedServer),
	clientManifest,
	widgets,
	artifactFiles,
};
fs.writeFileSync(path.join(output, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
	JSON.stringify(
		{
			output,
			sourceSha256: report.sourceSha256,
			toolchainSha256: report.toolchainSha256,
			widgets: widgets.length,
		},
		null,
		2,
	),
);
