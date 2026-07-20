import { execFileSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	getWorkspacePackages,
	REPO_ROOT,
	validateWorkspacePackages,
} from './workspace-packages.mjs';
import {
	createPackedExampleManifest,
	isWithinDirectory,
	NATIVE_GRAPH_FORBIDDEN_MODULE,
	renderPackedExampleWorkspace,
} from './package-pack-canaries.mjs';

const privatePackScaffolds = new Set(['@octanejs/lynx', '@octanejs/rspeedy-plugin']);
const packages = getWorkspacePackages().filter(
	(pkg) => !pkg.private || privatePackScaffolds.has(pkg.name),
);
const packageVersions = new Map(packages.map((pkg) => [pkg.name, pkg.version]));
const octaneSingletonConsumers = new Set([
	'@octanejs/app-core',
	'@octanejs/rspack-plugin',
	'@octanejs/rspeedy-plugin',
	'@octanejs/rsbuild-plugin',
	'@octanejs/vite-plugin',
]);
const viteToolRequire = createRequire(
	path.join(REPO_ROOT, 'packages/vite-plugin-octane/package.json'),
);
const viteVersion = viteToolRequire('vite/package.json').version;
const nodeTypesVersion = viteToolRequire('@types/node/package.json').version;
const packedExampleCanaries = [
	{
		artifacts: ['dist/index.html'],
		dependencyEdges: [['@octanejs/visx', '@octanejs/floating-ui']],
		directory: 'pulseboard',
		label: 'Pulseboard client example',
		packages: [
			'octane',
			'@octanejs/tanstack-table',
			'@octanejs/tanstack-virtual',
			'@octanejs/visx',
			'@octanejs/floating-ui',
		],
	},
	{
		artifacts: ['dist/client', 'dist/server/entry.js', 'dist/server/index.html'],
		dependencyEdges: [['@octanejs/vite-plugin', '@octanejs/app-core']],
		directory: 'wayfinder',
		label: 'Wayfinder SSR example',
		packages: ['octane', '@octanejs/vite-plugin', '@octanejs/app-core'],
	},
];
const inventoryErrors = validateWorkspacePackages(packages);
if (inventoryErrors.length) {
	console.error(`cannot pack an invalid package inventory:\n  - ${inventoryErrors.join('\n  - ')}`);
	process.exit(1);
}

function tarOutput(args) {
	return execFileSync('tar', args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

function collectStrings(value, label, output) {
	if (typeof value === 'string') {
		output.push({ label, value });
		return;
	}
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index++) {
			collectStrings(value[index], `${label}[${index}]`, output);
		}
		return;
	}
	if (value && typeof value === 'object') {
		for (const [key, child] of Object.entries(value)) {
			collectStrings(child, `${label}.${key}`, output);
		}
	}
}

function targetExists(target, files) {
	if (!target.startsWith('./')) return false;
	const relative = target.slice(2);
	if (!relative.includes('*')) return files.has(relative.replace(/\/$/, ''));
	const pattern = new RegExp(
		`^${relative
			.split('*')
			.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
			.join('.+')}$`,
	);
	return [...files].some((file) => pattern.test(file));
}

function validatePackedPackage(pkg, manifest, files) {
	const errors = [];
	if (manifest.name !== pkg.name || manifest.version !== pkg.version) {
		errors.push(
			`packed identity is ${manifest.name}@${manifest.version}, expected ${pkg.name}@${pkg.version}`,
		);
	}

	const allStrings = [];
	collectStrings(manifest, 'package.json', allStrings);
	for (const entry of allStrings) {
		if (/^(?:workspace|catalog):/.test(entry.value)) {
			errors.push(`${entry.label} retains unresolved protocol ${JSON.stringify(entry.value)}`);
		}
	}

	if (!manifest.exports) errors.push('package.json has no exports field');
	if (manifest.engines?.node !== '>=22') {
		errors.push(
			`packed engines.node is ${JSON.stringify(manifest.engines?.node)}, expected ">=22"`,
		);
	}

	if (pkg.role === 'framework binding' || octaneSingletonConsumers.has(pkg.name)) {
		if (manifest.dependencies?.octane !== undefined) {
			errors.push('packed manifest installs a duplicate octane runtime dependency');
		}
		const expectedOctane = packageVersions.get('octane');
		if (manifest.peerDependencies?.octane !== expectedOctane) {
			errors.push(
				`packed octane peer is ${JSON.stringify(manifest.peerDependencies?.octane)}, expected exact ${JSON.stringify(expectedOctane)}`,
			);
		}
	}
	if (pkg.role === 'deployment adapter') {
		const expectedAppCore = packageVersions.get('@octanejs/app-core');
		if (manifest.peerDependencies?.['@octanejs/app-core'] !== expectedAppCore) {
			errors.push(
				`packed app-core peer is ${JSON.stringify(manifest.peerDependencies?.['@octanejs/app-core'])}, expected exact ${JSON.stringify(expectedAppCore)}`,
			);
		}
	}
	const targets = [];
	for (const field of ['main', 'module', 'types', 'typings', 'exports', 'bin']) {
		if (manifest[field] != null) collectStrings(manifest[field], field, targets);
	}
	for (const target of targets) {
		if (!target.value.startsWith('./')) {
			// Legacy package entry fields and bin targets may legally omit `./`.
			// Export-map targets may not, so keep that stricter contract.
			if (/^(?:main|module|types|typings|bin)(?:\.|$)/.test(target.label)) {
				const normalized = `./${target.value}`;
				if (!targetExists(normalized, files)) {
					errors.push(`${target.label} points to missing ${JSON.stringify(target.value)}`);
				}
				continue;
			}
			errors.push(`${target.label} is not package-relative: ${JSON.stringify(target.value)}`);
			continue;
		}
		if (!targetExists(target.value, files)) {
			errors.push(`${target.label} points to missing ${JSON.stringify(target.value)}`);
		}
	}

	for (const file of files) {
		if (/(^|\/)(?:tests?|__tests__|coverage)(?:\/|$)/.test(file)) {
			errors.push(`tarball unexpectedly contains test artifact ${file}`);
		}
	}

	return errors;
}

function requireArchive(archives, packageName) {
	const archive = archives.get(packageName);
	if (!archive) throw new Error(`no packed archive was recorded for ${packageName}`);
	return archive;
}

function fileArchiveSpec(archives, packageName) {
	return `file:${requireArchive(archives, packageName)}`;
}

function preparePackedExample(tempRoot, archives, canary) {
	const sourceDirectory = path.join(REPO_ROOT, 'examples', canary.directory);
	const consumerDirectory = path.join(tempRoot, `example-${canary.directory}`);
	if (isWithinDirectory(REPO_ROOT, consumerDirectory)) {
		throw new Error(`${canary.label} consumer must be created outside the workspace`);
	}
	cpSync(sourceDirectory, consumerDirectory, {
		filter(source) {
			const relative = path.relative(sourceDirectory, source);
			const topLevel = relative.split(path.sep)[0];
			return !['dist', 'node_modules', 'playwright-report', 'test-results'].includes(topLevel);
		},
		recursive: true,
	});

	const manifestPath = path.join(consumerDirectory, 'package.json');
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	const archiveSpecs = Object.fromEntries(
		canary.packages.map((packageName) => [packageName, fileArchiveSpec(archives, packageName)]),
	);
	const packedManifest = createPackedExampleManifest(
		manifest,
		archiveSpecs,
		viteVersion,
		canary.label,
	);
	writeFileSync(manifestPath, `${JSON.stringify(packedManifest, null, 2)}\n`);
	writeFileSync(
		path.join(consumerDirectory, 'pnpm-workspace.yaml'),
		renderPackedExampleWorkspace(archiveSpecs),
	);
	return consumerDirectory;
}

function assertPackedExampleInstall(consumerDirectory, canary) {
	const consumerRequire = createRequire(path.join(consumerDirectory, 'package.json'));
	const directRuntime = realpathSync(consumerRequire.resolve('octane'));
	const resolvedPackages = new Map();

	for (const packageName of canary.packages) {
		const entry = realpathSync(consumerRequire.resolve(packageName));
		resolvedPackages.set(packageName, entry);
		if (isWithinDirectory(REPO_ROOT, entry)) {
			throw new Error(`${packageName} resolved back into the workspace: ${entry}`);
		}
		if (packageName !== 'octane') {
			const peerRuntime = realpathSync(createRequire(entry).resolve('octane'));
			if (peerRuntime !== directRuntime) {
				throw new Error(
					`${packageName} resolved a second Octane runtime:\n  app: ${directRuntime}\n  package: ${peerRuntime}`,
				);
			}
		}
	}
	for (const [consumerName, dependencyName] of canary.dependencyEdges) {
		const consumerEntry = resolvedPackages.get(consumerName);
		const directDependency = resolvedPackages.get(dependencyName);
		const nestedDependency = realpathSync(createRequire(consumerEntry).resolve(dependencyName));
		if (nestedDependency !== directDependency) {
			throw new Error(
				`${consumerName} resolved a second ${dependencyName} install:\n  app: ${directDependency}\n  package: ${nestedDependency}`,
			);
		}
	}
	for (const reactRuntime of ['react', 'react-dom']) {
		try {
			const entry = consumerRequire.resolve(reactRuntime);
			throw new Error(`${canary.label} unexpectedly installed ${reactRuntime}: ${entry}`);
		} catch (error) {
			if (error.code !== 'MODULE_NOT_FOUND') throw error;
		}
	}

	const virtualStore = path.join(consumerDirectory, 'node_modules/.pnpm');
	const installedRuntimeRoots = new Set();
	const installedReactRuntimes = [];
	for (const entry of readdirSync(virtualStore, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		if (/^(?:react|react-dom)@/.test(entry.name)) installedReactRuntimes.push(entry.name);
		const runtimeRoot = path.join(virtualStore, entry.name, 'node_modules/octane');
		if (existsSync(runtimeRoot)) installedRuntimeRoots.add(realpathSync(runtimeRoot));
	}
	if (installedRuntimeRoots.size !== 1) {
		throw new Error(
			`expected one physical Octane install, found ${installedRuntimeRoots.size}: ${[
				...installedRuntimeRoots,
			].join(', ')}`,
		);
	}
	if (installedReactRuntimes.length) {
		throw new Error(
			`${canary.label} installed React runtime packages: ${installedReactRuntimes.join(', ')}`,
		);
	}

	const lockfile = readFileSync(path.join(consumerDirectory, 'pnpm-lock.yaml'), 'utf8');
	if (/\b(?:workspace|link):/.test(lockfile) || lockfile.includes(`${REPO_ROOT}${path.sep}`)) {
		throw new Error('external example lockfile contains a workspace or link dependency');
	}
}

function validatePackedExample(tempRoot, archives, canary) {
	const consumerDirectory = preparePackedExample(tempRoot, archives, canary);
	execFileSync(
		'pnpm',
		[
			'install',
			'--prefer-offline',
			'--ignore-scripts',
			'--no-frozen-lockfile',
			'--config.auto-install-peers=false',
		],
		{
			cwd: consumerDirectory,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);
	assertPackedExampleInstall(consumerDirectory, canary);
	execFileSync('pnpm', ['run', 'build'], {
		cwd: consumerDirectory,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	for (const artifact of canary.artifacts) {
		if (!existsSync(path.join(consumerDirectory, artifact))) {
			throw new Error(`${canary.label} production build omitted ${artifact}`);
		}
	}
	console.log(
		`built ${canary.label} outside the workspace from ${canary.packages.length} packed package(s)`,
	);
}

/**
 * Install a real consumer outside the workspace, then compile one application
 * against the packed core and a raw-source binding in both client and server
 * modes. This catches peer-layout and source-publication failures that tarball
 * inspection alone cannot see.
 */
async function validatePackedConsumer(tempRoot, archives) {
	const consumerDirectory = path.join(tempRoot, 'external-consumer');
	const sourceDirectory = path.join(consumerDirectory, 'src');
	mkdirSync(sourceDirectory, { recursive: true });
	writeFileSync(
		path.join(consumerDirectory, 'package.json'),
		JSON.stringify(
			{
				name: 'octane-packed-consumer-smoke',
				private: true,
				type: 'module',
				engines: { node: '>=22' },
				dependencies: {
					'@apollo/client': '4.2.6',
					'@octanejs/apollo-client': `file:${requireArchive(archives, '@octanejs/apollo-client')}`,
					'@octanejs/hook-form': `file:${requireArchive(archives, '@octanejs/hook-form')}`,
					'@octanejs/three': `file:${requireArchive(archives, '@octanejs/three')}`,
					'@types/three': '0.172.0',
					graphql: '^16.11.0',
					octane: `file:${requireArchive(archives, 'octane')}`,
					rxjs: '^7.8.2',
					three: '0.172.0',
				},
				devDependencies: {
					'@types/node': nodeTypesVersion,
					vite: viteVersion,
				},
			},
			null,
			2,
		) + '\n',
	);
	writeFileSync(
		path.join(sourceDirectory, 'App.tsrx'),
		`import { ApolloClient, InMemoryCache } from '@octanejs/apollo-client';
import { ApolloProvider, useApolloClient } from '@octanejs/apollo-client/react';
import { useForm } from '@octanejs/hook-form';
import { Canvas } from '@octanejs/three';
import { ThreeScene } from './ThreeScene.three.tsrx';

const client = new ApolloClient({ cache: new InMemoryCache() });

function ApolloProbe() @{
	const activeClient = useApolloClient();
	<span data-apollo={activeClient === client ? 'connected' : 'missing'}>Apollo</span>
}

export function App() @{
	const form = useForm({ defaultValues: { name: 'Ada' } });
	<div data-probe="bindings-ran">
		<form>
			<input {...form.register('name')} />
		</form>
		<ApolloProvider client={client}>
			<ApolloProbe />
		</ApolloProvider>
		<Canvas frameloop="never" style={{ width: 64, height: 64 }}>
			<ThreeScene />
		</Canvas>
	</div>
}
`,
	);
	writeFileSync(
		path.join(sourceDirectory, 'ThreeScene.three.tsrx'),
		`import { useFrame } from '@octanejs/three';

export function ThreeScene() @{
	useFrame(() => {});
	<mesh name="packed-three-scene">
		<boxGeometry args={[1, 1, 1]} />
		<meshBasicMaterial color="hotpink" />
	</mesh>
}
`,
	);
	writeFileSync(
		path.join(sourceDirectory, 'package-surface.ts'),
		`import * as publicApi from '@octanejs/three';
import * as coreApi from '@octanejs/three/core';
import * as rendererApi from '@octanejs/three/renderer';
import config, { threeRenderers } from '@octanejs/three/config';
import testing, { create, fireEvent } from '@octanejs/three/testing';
import type { JSX as IntrinsicJSX } from '@octanejs/three/intrinsics';
import type { JSX as RuntimeJSX } from '@octanejs/three/intrinsics/jsx-runtime';
import type { ReconcilerRoot, ThreeElements } from '@octanejs/three';

type IntrinsicMesh = IntrinsicJSX.IntrinsicElements['mesh'];
type RuntimeMesh = RuntimeJSX.IntrinsicElements['mesh'];
type RootMesh = ThreeElements['mesh'];

const intrinsicMesh: IntrinsicMesh = { position: [1, 2, 3] };
const runtimeMesh: RuntimeMesh = intrinsicMesh;
const rootMesh: RootMesh = runtimeMesh;
const reconcilerRoot: ReconcilerRoot<HTMLCanvasElement> | undefined = undefined;

export function packageSurfaceProbe() {
	void rootMesh;
	void reconcilerRoot;
	return {
		config: config === threeRenderers,
		core: typeof coreApi.createRoot === 'function',
		publicApi: typeof publicApi.Canvas === 'function',
		renderer: typeof rendererApi.createUniversalRoot === 'function',
		testing: testing.create === create && typeof fireEvent === 'function',
	};
}
`,
	);
	writeFileSync(
		path.join(sourceDirectory, 'compiler-plugin.ts'),
		`import type { Plugin } from 'vite';
import {
	discoverOctaneSourceDependencies,
	octane,
	type OctaneVitePluginOptions,
} from 'octane/compiler/vite';

const options = {
	hmr: false,
	profile: false,
	requireDirective: true,
} satisfies OctaneVitePluginOptions;

export const compilerPlugin: Plugin = octane(options);
export const sourceDependencies: string[] = discoverOctaneSourceDependencies(process.cwd());
`,
	);
	writeFileSync(
		path.join(sourceDirectory, 'main.tsrx'),
		`import { createRoot } from 'octane';
import { App } from './App.tsrx';

const target = document.getElementById('app');
if (target) createRoot(target).render(App);
`,
	);
	writeFileSync(
		path.join(sourceDirectory, 'entry-server.ts'),
		`import { renderToString } from 'octane/server';
import { App } from './App.tsrx';
import { packageSurfaceProbe } from './package-surface.ts';

export function renderProbe() {
	return { html: renderToString(App).html, surface: packageSurfaceProbe() };
}
`,
	);
	writeFileSync(
		path.join(consumerDirectory, 'tsconfig.json'),
		JSON.stringify(
			{
				compilerOptions: {
					lib: ['dom', 'dom.iterable', 'esnext'],
					module: 'esnext',
					moduleResolution: 'bundler',
					noEmit: true,
					skipLibCheck: false,
					strict: true,
					target: 'esnext',
					types: ['node'],
				},
				include: ['src/compiler-plugin.ts', 'src/package-surface.ts'],
			},
			null,
			2,
		) + '\n',
	);
	writeFileSync(
		path.join(consumerDirectory, 'index.html'),
		`<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.tsrx"></script></body></html>\n`,
	);

	execFileSync(
		'pnpm',
		[
			'install',
			'--prefer-offline',
			'--ignore-scripts',
			'--no-frozen-lockfile',
			'--config.auto-install-peers=false',
		],
		{
			cwd: consumerDirectory,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);

	const consumerRequire = createRequire(path.join(consumerDirectory, 'package.json'));
	const directRuntime = realpathSync(consumerRequire.resolve('octane'));
	const bindingEntry = consumerRequire.resolve('@octanejs/hook-form');
	const peerRuntime = realpathSync(createRequire(bindingEntry).resolve('octane'));
	if (peerRuntime !== directRuntime) {
		throw new Error(
			`binding resolved a second Octane runtime:\n  app: ${directRuntime}\n  binding: ${peerRuntime}`,
		);
	}
	const threeEntry = consumerRequire.resolve('@octanejs/three');
	const threeRequire = createRequire(threeEntry);
	const threePeerRuntime = realpathSync(threeRequire.resolve('octane'));
	if (threePeerRuntime !== directRuntime) {
		throw new Error(
			`Three binding resolved a second Octane runtime:\n  app: ${directRuntime}\n  binding: ${threePeerRuntime}`,
		);
	}
	const directThree = realpathSync(consumerRequire.resolve('three'));
	const peerThree = realpathSync(threeRequire.resolve('three'));
	if (peerThree !== directThree) {
		throw new Error(
			`Three binding resolved a second Three runtime:\n  app: ${directThree}\n  binding: ${peerThree}`,
		);
	}
	const virtualStoreEntries = readdirSync(path.join(consumerDirectory, 'node_modules/.pnpm'));
	const installedRuntimes = virtualStoreEntries.filter((entry) => /^octane@/.test(entry));
	if (installedRuntimes.length !== 1) {
		throw new Error(
			`expected one physical Octane install, found ${installedRuntimes.length}: ${installedRuntimes.join(', ')}`,
		);
	}

	const compilerPluginEntry = consumerRequire.resolve('octane/compiler/vite');
	const { octane } = await import(pathToFileURL(compilerPluginEntry).href);
	const threeConfigEntry = consumerRequire.resolve('@octanejs/three/config');
	const repositoryRequire = createRequire(path.join(REPO_ROOT, 'package.json'));
	const threeConfigBundle = path.join(consumerDirectory, 'three-config.mjs');
	execFileSync(
		repositoryRequire.resolve('esbuild/bin/esbuild'),
		[
			threeConfigEntry,
			'--bundle',
			'--platform=node',
			'--format=esm',
			`--outfile=${threeConfigBundle}`,
		],
		{
			cwd: consumerDirectory,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);
	const { threeRenderers } = await import(pathToFileURL(threeConfigBundle).href);
	execFileSync(
		process.execPath,
		[repositoryRequire.resolve('typescript/bin/tsc'), '--noEmit', '-p', 'tsconfig.json'],
		{
			cwd: consumerDirectory,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);
	const { build: viteBuild } = await import(pathToFileURL(viteToolRequire.resolve('vite')).href);
	await viteBuild({
		root: consumerDirectory,
		configFile: false,
		logLevel: 'silent',
		plugins: [octane({ hmr: false, renderers: threeRenderers })],
		build: {
			emptyOutDir: true,
			outDir: 'dist/client',
			rollupOptions: {
				input: 'src/main.tsrx',
				output: { entryFileNames: 'entry.mjs' },
			},
			target: 'esnext',
		},
	});
	await viteBuild({
		root: consumerDirectory,
		configFile: false,
		logLevel: 'silent',
		plugins: [octane({ hmr: false, renderers: threeRenderers })],
		build: {
			emptyOutDir: true,
			outDir: 'dist/server',
			rollupOptions: { output: { entryFileNames: 'entry.mjs' } },
			ssr: 'src/entry-server.ts',
			target: 'esnext',
		},
	});

	const serverBundle = path.join(consumerDirectory, 'dist/server/entry.mjs');
	const probeRunner = path.join(consumerDirectory, 'probe-runner.mjs');
	writeFileSync(
		probeRunner,
		`import { renderProbe } from ${JSON.stringify(pathToFileURL(serverBundle).href)};

const output = 'OCTANE_PACK_PROBE:' + JSON.stringify(renderProbe()) + '\\n';
process.stdout.write(output, () => process.exit(0));
`,
	);
	// Packed browser bindings can retain scheduler handles in Node. Execute the
	// SSR probe in a disposable process and explicitly finish after stdout flushes.
	const probeOutput = execFileSync(process.execPath, [probeRunner], {
		cwd: consumerDirectory,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		timeout: 30_000,
	});
	const probeLine = probeOutput.split('\n').find((line) => line.startsWith('OCTANE_PACK_PROBE:'));
	if (probeLine === undefined) {
		throw new Error(`executed packed consumer probe returned no result: ${probeOutput}`);
	}
	const { html, surface } = JSON.parse(probeLine.slice('OCTANE_PACK_PROBE:'.length));
	if (
		!html.includes('data-probe="bindings-ran"') ||
		!html.includes('name="name"') ||
		!html.includes('data-apollo="connected"') ||
		!html.includes('<canvas')
	) {
		throw new Error(`executed packed consumer probe returned unexpected HTML: ${html}`);
	}
	if (Object.values(surface).some((value) => value !== true)) {
		throw new Error(`packed Three subpath probe failed: ${JSON.stringify(surface)}`);
	}

	console.log(
		'installed packed octane + Hook Form + Apollo Client + Three without React; typecheck, Vite client/server builds, subpaths, and executed binding SSR passed',
	);
}

/**
 * Exercise the private Phase 1 Lynx compiler packages exactly as an external
 * application consumes them. This is intentionally a production JavaScript
 * compile check, not a native bundle or device-runtime claim.
 */
function validatePackedLynxConsumer(tempRoot, archives) {
	const consumerDirectory = path.join(tempRoot, 'external-lynx-consumer');
	const sourceDirectory = path.join(consumerDirectory, 'src');
	const outputDirectory = path.join(consumerDirectory, 'dist');
	if (isWithinDirectory(REPO_ROOT, consumerDirectory)) {
		throw new Error('packed Lynx consumer must be created outside the workspace');
	}
	mkdirSync(sourceDirectory, { recursive: true });
	const archiveSpecs = Object.fromEntries(
		['octane', '@octanejs/rspack-plugin', '@octanejs/lynx', '@octanejs/rspeedy-plugin'].map(
			(packageName) => [packageName, fileArchiveSpec(archives, packageName)],
		),
	);
	writeFileSync(
		path.join(consumerDirectory, 'package.json'),
		JSON.stringify(
			{
				name: 'octane-packed-lynx-consumer-smoke',
				private: true,
				type: 'module',
				engines: { node: '>=22' },
				dependencies: {
					'@lynx-js/rspeedy': '0.16.0',
					'@octanejs/lynx': archiveSpecs['@octanejs/lynx'],
					'@octanejs/rspack-plugin': archiveSpecs['@octanejs/rspack-plugin'],
					'@octanejs/rspeedy-plugin': archiveSpecs['@octanejs/rspeedy-plugin'],
					'@rsbuild/core': '2.1.4',
					'@rspack/core': '2.1.3',
					octane: archiveSpecs.octane,
				},
			},
			null,
			2,
		) + '\n',
	);
	writeFileSync(
		path.join(consumerDirectory, 'pnpm-workspace.yaml'),
		renderPackedExampleWorkspace(archiveSpecs),
	);
	writeFileSync(
		path.join(sourceDirectory, 'App.tsrx'),
		`import { createLynxNativeResource } from '@octanejs/lynx';
import { lynxPlatformAvailability } from '@octanejs/lynx/platform';
import { useState } from 'octane';

const resource = createLynxNativeResource('packed-resource');
if (resource.id !== 'packed-resource' || lynxPlatformAvailability.implementedMilestone !== 4) {
	throw new Error('packed Lynx Milestone 4 public subpaths are incomplete');
}

export function App() @{
	const [count, setCount] = useState(0);
	<view id="packed-lynx" bindtap={() => setCount((value) => value + 1)}>
		<text>{\`Count: \${count}\`}</text>
	</view>
}

globalThis.__octanePackedLynxProbe = 'octane-packed-lynx-compiled';
`,
	);
	writeFileSync(
		path.join(consumerDirectory, 'build.mjs'),
		`import { createRspeedy } from '@lynx-js/rspeedy';
import { pluginOctane, assertLynxToolchain } from '@octanejs/rspeedy-plugin';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = ${JSON.stringify(consumerDirectory)};
const outputRoot = ${JSON.stringify(outputDirectory)};
const request = createRequire(import.meta.url);
const directRuntime = realpathSync(request.resolve('octane'));
const directLynx = realpathSync(request.resolve('@octanejs/lynx'));
const directRspackPlugin = realpathSync(request.resolve('@octanejs/rspack-plugin'));
const rspeedyPlugin = realpathSync(request.resolve('@octanejs/rspeedy-plugin'));

for (const [name, entry] of [
	['@octanejs/lynx', directLynx],
	['@octanejs/rspack-plugin', directRspackPlugin],
	['@octanejs/rspeedy-plugin', rspeedyPlugin],
]) {
	const peerRuntime = realpathSync(createRequire(entry).resolve('octane'));
	if (peerRuntime !== directRuntime) {
		throw new Error(name + ' resolved a second Octane runtime:\\n  app: ' + directRuntime + '\\n  package: ' + peerRuntime);
	}
}

const pluginRequest = createRequire(rspeedyPlugin);
if (realpathSync(pluginRequest.resolve('@octanejs/lynx')) !== directLynx) {
	throw new Error('@octanejs/rspeedy-plugin resolved a second @octanejs/lynx install');
}
if (realpathSync(pluginRequest.resolve('@octanejs/rspack-plugin')) !== directRspackPlugin) {
	throw new Error('@octanejs/rspeedy-plugin resolved a second @octanejs/rspack-plugin install');
}

const toolchain = assertLynxToolchain(root);
for (const [name, version] of Object.entries({
	'@lynx-js/rspeedy': '0.16.0',
	'@rsbuild/core': '2.1.4',
	'@rspack/core': '2.1.3',
})) {
	if (toolchain[name].version !== version) {
		throw new Error(name + ' resolved ' + toolchain[name].version + ', expected ' + version);
	}
}

const virtualStore = path.join(root, 'node_modules/.pnpm');
const octaneRoots = new Set();
const reactPackages = [];
for (const entry of readdirSync(virtualStore, { withFileTypes: true })) {
	if (!entry.isDirectory()) continue;
	if (/^(?:react|react-dom|preact)@/.test(entry.name)) reactPackages.push(entry.name);
	const octaneRoot = path.join(virtualStore, entry.name, 'node_modules/octane');
	if (existsSync(octaneRoot)) octaneRoots.add(realpathSync(octaneRoot));
}
if (octaneRoots.size !== 1) {
	throw new Error('expected one physical Octane install, found ' + octaneRoots.size + ': ' + [...octaneRoots].join(', '));
}
if (reactPackages.length) {
	throw new Error('packed Lynx consumer installed React runtimes: ' + reactPackages.join(', '));
}

const moduleIdentifiers = [];
class ModuleGraphProbePlugin {
	apply(compiler) {
		compiler.hooks.compilation.tap(this.constructor.name, (compilation) => {
			compilation.hooks.finishModules.tap(this.constructor.name, (modules) => {
				for (const module of modules) {
					for (const identifier of [module.identifier?.(), module.nameForCondition?.()]) {
						if (typeof identifier === 'string') moduleIdentifiers.push(identifier);
					}
				}
			});
		});
	}
}
const graphProbe = {
	name: 'octane:packed-lynx-module-graph-probe',
	setup(api) {
		api.modifyBundlerChain((chain) => {
			chain.plugin('octane:packed-lynx-module-graph-probe').use(ModuleGraphProbePlugin);
		});
	},
};

const rspeedy = await createRspeedy({
	cwd: root,
	loadEnv: false,
	environment: ['lynx'],
	rspeedyConfig: {
		mode: 'production',
		environments: { lynx: {} },
		dev: { hmr: false, liveReload: false },
		output: {
			cleanDistPath: true,
			distPath: { root: outputRoot },
			filenameHash: false,
			sourceMap: false,
		},
		source: { entry: { main: './src/App.tsrx' } },
		splitChunks: false,
		plugins: [pluginOctane({ thread: 'background', hmr: false, dev: false }), graphProbe],
	},
});
let result;
try {
	result = await rspeedy.build();
	const modules = new Set(
		moduleIdentifiers.map((identifier) => identifier.split(/[?!]/, 1)[0].replaceAll('\\\\', '/')),
	);
	const matchingModules = (pattern) => [...modules].filter((identifier) => pattern.test(identifier));
	if (matchingModules(/\\/App\\.tsrx$/).length !== 1) {
		throw new Error('production graph did not contain exactly one ordinary App.tsrx entry');
	}
	if (matchingModules(/\\/universal-core\\.[jt]s$/).length !== 1) {
		throw new Error('production graph did not contain exactly one Octane universal core');
	}
	if (matchingModules(/\\/universal-native\\.[jt]s$/).length !== 1) {
		throw new Error('production graph did not contain exactly one Octane native universal facade');
	}
	const forbiddenModule = new RegExp(
		${JSON.stringify(NATIVE_GRAPH_FORBIDDEN_MODULE.source)},
		${JSON.stringify(NATIVE_GRAPH_FORBIDDEN_MODULE.flags)},
	);
	const forbiddenModules = [...modules].filter((identifier) => forbiddenModule.test(identifier));
	if (forbiddenModules.length) {
		throw new Error('production Lynx graph contains DOM or React modules: ' + forbiddenModules.join(', '));
	}

	function readJavaScript(directory) {
		let output = '';
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const filename = path.join(directory, entry.name);
			if (entry.isDirectory()) output += readJavaScript(filename);
			else if (/\\.(?:c|m)?js$/.test(entry.name)) output += readFileSync(filename, 'utf8');
		}
		return output;
	}
	const output = readJavaScript(outputRoot);
	if (!output.includes('octane-packed-lynx-compiled')) {
		throw new Error('production Rspeedy build emitted no executable JavaScript probe');
	}
	if (/\\b(?:document|window|HTMLElement|MutationObserver)\\b/.test(output)) {
		throw new Error('production Rspeedy JavaScript contains a DOM runtime global');
	}
	if (/(?:^|[^$\\w])(?:react|react-dom|preact|ReactLynx)(?:[^$\\w]|$)/i.test(output)) {
		throw new Error('production Rspeedy JavaScript contains a React runtime reference');
	}
} finally {
	await result?.close();
}
`,
	);

	execFileSync(
		'pnpm',
		[
			'install',
			'--prefer-offline',
			'--ignore-scripts',
			'--no-frozen-lockfile',
			'--config.auto-install-peers=false',
		],
		{
			cwd: consumerDirectory,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);
	execFileSync(process.execPath, ['build.mjs'], {
		cwd: consumerDirectory,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		timeout: 120_000,
	});

	console.log(
		'built one packed Lynx production JavaScript graph outside the workspace; exact toolchain, singleton Octane/native core, and DOM/React exclusions passed',
	);
}

const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'octane-pack-check-'));
const failures = [];
const packedArchives = new Map();
let rawTsrxFiles = 0;

try {
	for (const pkg of packages) {
		const outputDirectory = path.join(tempRoot, pkg.dir);
		mkdirSync(outputDirectory, { recursive: true });
		try {
			execFileSync(
				'pnpm',
				['--dir', pkg.directory, 'pack', '--pack-destination', outputDirectory],
				{ cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
			);
			const archiveFiles = readdirSync(outputDirectory).filter((file) => file.endsWith('.tgz'));
			if (archiveFiles.length !== 1) {
				throw new Error(`expected one .tgz, found ${archiveFiles.length}`);
			}
			const archive = path.join(outputDirectory, archiveFiles[0]);
			packedArchives.set(pkg.name, archive);
			const manifest = JSON.parse(tarOutput(['-xOf', archive, 'package/package.json']));
			const files = new Set(
				tarOutput(['-tzf', archive])
					.split('\n')
					.filter(Boolean)
					.map((file) => file.replace(/^package\//, '').replace(/\/$/, '')),
			);
			rawTsrxFiles += [...files].filter((file) => file.endsWith('.tsrx')).length;
			const errors = validatePackedPackage(pkg, manifest, files);
			if (errors.length) failures.push(`${pkg.name}:\n    - ${errors.join('\n    - ')}`);
			else console.log(`packed ${pkg.name} (${files.size} files)`);
		} catch (error) {
			const detail = [error.message, error.stdout, error.stderr].filter(Boolean).join('\n');
			failures.push(`${pkg.name}: pack failed\n${detail}`);
		}
	}
	if (!failures.length) {
		const consumerValidations = [
			{
				label: 'external packed consumer',
				run: () => validatePackedConsumer(tempRoot, packedArchives),
			},
			{
				label: 'external packed Lynx consumer',
				run: () => validatePackedLynxConsumer(tempRoot, packedArchives),
			},
			...packedExampleCanaries.map((canary) => ({
				label: canary.label,
				run: () => validatePackedExample(tempRoot, packedArchives, canary),
			})),
		];
		for (const validation of consumerValidations) {
			try {
				await validation.run();
			} catch (error) {
				const detail = [error.message, error.stdout, error.stderr].filter(Boolean).join('\n');
				failures.push(`${validation.label}: validation failed\n${detail}`);
			}
		}
	}
} finally {
	rmSync(tempRoot, { recursive: true, force: true });
}

if (failures.length) {
	console.error(`package pack validation failed:\n\n${failures.join('\n\n')}`);
	process.exit(1);
}

console.log(
	`validated ${packages.length} package tarball(s); preserved ${rawTsrxFiles} raw TSRX source file(s).`,
);
