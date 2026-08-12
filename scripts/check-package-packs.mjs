import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
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
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
	getWorkspacePackages,
	REPO_ROOT,
	validateWorkspacePackages,
} from './workspace-packages.mjs';
import {
	createPackedJavascriptConsumerManifest,
	createPackedTsrxConsumerConfig,
	createPackedTsrxConsumerManifest,
	createPackedExampleManifest,
	isWithinDirectory,
	findPackedTsrxSourceConsumerPackages,
	findPackedTsrxSourceConsumerSpecifiers,
	findPackedWorkspaceDependencyClosure,
	findExternalDependencySpecs,
	NATIVE_GRAPH_FORBIDDEN_MODULE,
	PACKED_COMMONJS_CONSUMER_PACKAGES,
	PACKED_JAVASCRIPT_CONSUMER_PACKAGES,
	PACKED_TSRX_CONSUMER_PROJECTS,
	PACKED_TSRX_PROBE_PACKAGES,
	renderPackedExampleWorkspace,
	renderPackedCommonjsConsumerSource,
	renderPackedDraggableEsmConsumerSource,
	renderPackedEsmConsumerSource,
	renderPackedTsrxConsumerSource,
	renderPackedTsrxSourceImports,
	renderPackedTsrxConsumerTypeProbe,
} from './package-pack-canaries.mjs';
import { LYNX_TOOLCHAIN_LANES } from '../packages/rspeedy-plugin-octane/src/toolchain-lanes.js';
import {
	assertRequiredPublicValueExports,
	REQUIRED_PUBLIC_VALUE_EXPORTS,
} from '../packages/octane/scripts/verify-dist.mjs';

const privatePackScaffolds = new Set(['@octanejs/lynx', '@octanejs/rspeedy-plugin']);
const packages = getWorkspacePackages().filter(
	(pkg) => !pkg.private || privatePackScaffolds.has(pkg.name),
);
const packageVersions = new Map(packages.map((pkg) => [pkg.name, pkg.version]));
const octaneSingletonConsumers = new Set([
	'@octanejs/app-core',
	'@octanejs/docusaurus',
	'@octanejs/rspack-plugin',
	'@octanejs/rspeedy-plugin',
	'@octanejs/rsbuild-plugin',
	'@octanejs/tanstack-start',
	'@octanejs/vite-plugin',
]);
const viteToolRequire = createRequire(
	path.join(REPO_ROOT, 'packages/vite-plugin-octane/package.json'),
);
const repositoryRequire = createRequire(path.join(REPO_ROOT, 'package.json'));
const packageManager = repositoryRequire('./package.json').packageManager;
const viteVersion = viteToolRequire('vite/package.json').version;
const nodeTypesVersion = viteToolRequire('@types/node/package.json').version;
const tsrxTypeScriptPluginVersion = repositoryRequire(
	'@tsrx/typescript-plugin/package.json',
).version;
const typescriptVersion = repositoryRequire('typescript/package.json').version;
const packedExampleCanaries = [
	{
		artifacts: ['dist/index.html'],
		dependencyEdges: [
			['@octanejs/visx', '@octanejs/floating-ui'],
			// The table binding reads its state through @octanejs/tanstack-store's
			// useSelector, so a second copy would mean a second @tanstack/store and
			// atom identities that no longer match the table's.
			['@octanejs/tanstack-table', '@octanejs/tanstack-store'],
		],
		directory: 'pulseboard',
		label: 'Pulseboard client example',
		packages: [
			'octane',
			'@octanejs/tanstack-table',
			'@octanejs/tanstack-store',
			'@octanejs/tanstack-hotkeys',
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
		packages: ['octane', '@octanejs/vite-plugin', '@octanejs/app-core', '@octanejs/seo'],
	},
];
// Keep known upstream type-graph debt explicit while every new source binding
// is enrolled automatically. Issue #721 owns removing these exceptions.
const packedTsrxSourceExceptions = new Map([
	['@octanejs/aria', 'its browser source still reads process.env.NODE_ENV'],
	['@octanejs/base-ui', 'its browser source still reads process.env.NODE_ENV'],
	['@octanejs/cmdk', 'its browser source still reads process.env.NODE_ENV'],
	['@octanejs/dnd-kit', 'its browser source still reads process.env.NODE_ENV'],
	[
		'@octanejs/drei',
		'its source and upstream Three declarations are not yet compatible with strict TypeScript',
	],
	[
		'@octanejs/livestore',
		'LiveStore 0.4 declarations require the exact Effect peer graph from the workspace lockfile',
	],
	[
		'@octanejs/lexical',
		'its upstream declarations require explicit disposable globals outside the stable ES2024 library',
	],
	[
		'@octanejs/monaco-editor',
		'its published source reaches Monaco declarations that are not available from the loader peer',
	],
	[
		'@octanejs/rainbowkit',
		'its Wagmi and TanStack Query peer declarations are not yet mutually compatible under strict checking',
	],
	['@octanejs/jotai', 'its browser source still reads process.env.NODE_ENV'],
	['@octanejs/popper', 'its browser source still reads process.env.NODE_ENV'],
	['@octanejs/react-map-gl', 'its published source requires Mapbox GeoJSON ambient declarations'],
	[
		'@octanejs/recharts',
		'extensionless relative imports do not yet resolve to sibling TSRX modules in tsrx-tsc',
	],
	[
		'@octanejs/remix-router',
		'its ref and browser-global source typing debt is tracked by companion PR #734',
	],
	['@octanejs/redux', 'its browser source still reads process.env.NODE_ENV'],
	[
		'@octanejs/solana-react',
		'its TanStack Query peer declarations are not yet compatible with the installed strict consumer graph',
	],
	['@octanejs/tanstack-query', 'its browser source still reads process.env.NODE_ENV'],
	[
		'@octanejs/tanstack-router',
		'its browser source reads process.env.NODE_ENV and its upstream declarations import node:http2',
	],
	['@octanejs/tiptap', 'its browser source still reads process.env.NODE_ENV'],
	['@octanejs/visx', 'React SVG and event prop types are not yet Octane-native'],
	[
		'@octanejs/wagmi',
		'its Wagmi and TanStack Query peer declarations are not yet mutually compatible under strict checking',
	],
]);
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

function validatePackedPackage(pkg, manifest, files, executableFiles) {
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
	if (pkg.name === 'octane' && manifest.exports) {
		const packedSubpaths = new Set(Object.keys(manifest.exports));
		for (const subpath of Object.keys(pkg.manifest.exports)) {
			if (!packedSubpaths.has(subpath)) {
				errors.push(`packed exports omit advertised source subpath ${JSON.stringify(subpath)}`);
			}
		}
	}
	if (manifest.engines?.node !== '>=22.22.2') {
		errors.push(
			`packed engines.node is ${JSON.stringify(manifest.engines?.node)}, expected ">=22.22.2"`,
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
	for (const field of ['main', 'module', 'types', 'typings', 'exports', 'imports', 'bin']) {
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

	// A bin without the executable bit installs as a symlink the shell refuses to
	// run ("permission denied"). npm repairs this for some install paths and not
	// others, so the mode has to be correct in the tarball itself.
	const binTargets = [];
	if (manifest.bin != null) collectStrings(manifest.bin, 'bin', binTargets);
	for (const target of binTargets) {
		const normalized = target.value.replace(/^\.\//, '');
		if (files.has(normalized) && !executableFiles.has(normalized)) {
			errors.push(
				`${target.label} ${JSON.stringify(target.value)} is not executable in the tarball`,
			);
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
				engines: { node: '>=22.22.2' },
				dependencies: {
					'@apollo/client': '4.2.6',
					'@octanejs/alien-signals': `file:${requireArchive(archives, '@octanejs/alien-signals')}`,
					'@octanejs/apollo-client': `file:${requireArchive(archives, '@octanejs/apollo-client')}`,
					'@octanejs/hook-form': `file:${requireArchive(archives, '@octanejs/hook-form')}`,
					'@octanejs/dropzone': `file:${requireArchive(archives, '@octanejs/dropzone')}`,
					'@octanejs/syntax-highlighter': `file:${requireArchive(archives, '@octanejs/syntax-highlighter')}`,
					'@octanejs/three': `file:${requireArchive(archives, '@octanejs/three')}`,
					'@octanejs/window': `file:${requireArchive(archives, '@octanejs/window')}`,
					'@types/three': '0.172.0',
					graphql: '^16.11.0',
					octane: `file:${requireArchive(archives, 'octane')}`,
					rxjs: '^7.8.2',
					three: '0.172.0',
				},
				devDependencies: {
					'@tsrx/typescript-plugin': tsrxTypeScriptPluginVersion,
					'@types/node': nodeTypesVersion,
					typescript: typescriptVersion,
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
import { createComputed, createSignal, useSignalValue } from '@octanejs/alien-signals';
import { useForm } from '@octanejs/hook-form';
import { useDropzone } from '@octanejs/dropzone';
import { Light, Prism, PrismAsync } from '@octanejs/syntax-highlighter';
import javascript from '@octanejs/syntax-highlighter/dist/esm/languages/hljs/javascript';
import vscDarkPlus from '@octanejs/syntax-highlighter/dist/cjs/styles/prism/vsc-dark-plus';
import { Grid, List, type CellComponentProps, type RowComponentProps } from '@octanejs/window';
import { Canvas } from '@octanejs/three';
import { ThreeScene } from './ThreeScene.three.tsrx';

const client = new ApolloClient({ cache: new InMemoryCache() });
const count = createSignal(2);
const doubled = createComputed(() => count() * 2);
Light.registerLanguage('javascript', javascript);

function ApolloProbe() @{
	const activeClient = useApolloClient();
	<span data-apollo={activeClient === client ? 'connected' : 'missing'}>Apollo</span>
}

function PackedRow({ ariaAttributes, index, style }: RowComponentProps) {
	return <div {...ariaAttributes} data-packed-row={index} style={style}>{'Row ' + index}</div>;
}

function PackedCell({ ariaAttributes, columnIndex, rowIndex, style }: CellComponentProps) {
	return <div {...ariaAttributes} data-packed-cell={rowIndex + ':' + columnIndex} style={style}>{rowIndex + ':' + columnIndex}</div>;
}

export function App() @{
	const form = useForm({ defaultValues: { name: 'Ada' } });
	const signalValue = useSignalValue(doubled);
	const dropzone = useDropzone({ noClick: true });
	<div data-probe="bindings-ran">
		<span data-alien-signals={signalValue as string}>Alien Signals</span>
		<form>
			<input {...form.register('name')} />
		</form>
		<div {...dropzone.getRootProps()}>
			<input {...dropzone.getInputProps()} />
			<span>{dropzone.isProcessing ? 'Processing' : 'Drop files'}</span>
		</div>
		<ApolloProvider client={client}>
			<ApolloProbe />
		</ApolloProvider>
		<Light
			data-packed-syntax="light"
			language="javascript"
			children={'const packedLight = true;'}
		/>
		<Prism
			data-packed-syntax="prism"
			language="javascript"
			style={vscDarkPlus}
			children={'const packedPrism = true;'}
		/>
		<PrismAsync
			data-packed-syntax="async"
			language="javascript"
			children={'const packedAsync = true;'}
		/>
		<List
			data-testid="packed-list"
			defaultHeight={40}
			rowComponent={PackedRow}
			rowCount={100}
			rowHeight={20}
			rowProps={{}}
		/>
		<Grid
			cellComponent={PackedCell}
			cellProps={{}}
			columnCount={100}
			columnWidth={20}
			data-testid="packed-grid"
			defaultHeight={40}
			defaultWidth={40}
			rowCount={100}
			rowHeight={20}
		/>
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
import Dropzone, {
	ErrorCode,
	useDropzone,
	type Accept,
	type AcceptGroup,
	type DropEvent,
	type DropzoneInputProps,
	type DropzoneOptions,
	type DropzoneProps,
	type DropzoneRef,
	type DropzoneRootProps,
	type DropzoneState,
	type FileError,
	type FileRejection,
	type FileWithPath,
	type ValidatorResult,
} from '@octanejs/dropzone';
import dropzonePackage from '@octanejs/dropzone/package.json' with { type: 'json' };
import * as syntaxApi from '@octanejs/syntax-highlighter';
import LightAsync from '@octanejs/syntax-highlighter/dist/esm/light-async';
import PrismLight from '@octanejs/syntax-highlighter/dist/cjs/prism-light.js';
import syntaxJavascript from '@octanejs/syntax-highlighter/dist/cjs/languages/hljs/javascript.js';
import syntaxVscDarkPlus from '@octanejs/syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus.js';
import {
	Grid,
	List,
	getScrollbarSize,
	useDynamicRowHeight,
	useGridCallbackRef,
	useGridRef,
	useListCallbackRef,
	useListRef,
	type Align,
	type CellComponentProps,
	type DynamicRowHeight,
	type GridImperativeAPI,
	type GridProps,
	type ListImperativeAPI,
	type ListProps,
	type RowComponentProps,
} from '@octanejs/window';
import { map_iterable } from 'octane/tsrx-iterable';
import {
	normalize_spread_props,
	normalize_spread_props_for_ref_attr,
} from 'octane/tsrx-spread';
import type { JSX as OctaneRuntimeJSX } from 'octane/jsx-runtime';
import type { JSX as OctaneDevRuntimeJSX } from 'octane/jsx-dev-runtime';
import type { JSX as IntrinsicJSX } from '@octanejs/three/intrinsics';
import type { JSX as RuntimeJSX } from '@octanejs/three/intrinsics/jsx-runtime';
import type { ReconcilerRoot, ThreeElements } from '@octanejs/three';

type OctaneRuntimeDiv = OctaneRuntimeJSX.IntrinsicElements['div'];
type OctaneDevRuntimeDiv = OctaneDevRuntimeJSX.IntrinsicElements['div'];
type IntrinsicMesh = IntrinsicJSX.IntrinsicElements['mesh'];
type RuntimeMesh = RuntimeJSX.IntrinsicElements['mesh'];
type RootMesh = ThreeElements['mesh'];

const octaneRuntimeDiv: OctaneRuntimeDiv = {};
const octaneDevRuntimeDiv: OctaneDevRuntimeDiv = octaneRuntimeDiv;
const intrinsicMesh: IntrinsicMesh = { position: [1, 2, 3] };
const runtimeMesh: RuntimeMesh = intrinsicMesh;
const rootMesh: RootMesh = runtimeMesh;
const reconcilerRoot: ReconcilerRoot<HTMLCanvasElement> | undefined = undefined;
const dropzoneOptions: DropzoneOptions = { maxFiles: 2, noClick: true };
const dropzoneState: DropzoneState | undefined = undefined;
const fileRejections: readonly FileRejection[] = [];
type DropzonePublicTypeSurface = [
	Accept,
	AcceptGroup,
	DropEvent,
	DropzoneInputProps,
	DropzoneOptions,
	DropzoneProps,
	DropzoneRef,
	DropzoneRootProps,
	DropzoneState,
	FileError,
	FileRejection,
	FileWithPath,
	ValidatorResult,
];
type DropzonePublicTypeArity = DropzonePublicTypeSurface['length'];
const dropzonePublicTypeArity: DropzonePublicTypeArity = 13;
const align: Align = 'smart';
const listProps: ListProps<Record<string, never>> = {
	rowComponent: () => null,
	rowCount: 0,
	rowHeight: 20,
	rowProps: {},
};
const gridProps: GridProps<Record<string, never>> = {
	cellComponent: () => null,
	cellProps: {},
	columnCount: 0,
	columnWidth: 20,
	rowCount: 0,
	rowHeight: 20,
};
const rowProps: RowComponentProps | undefined = undefined;
const cellProps: CellComponentProps | undefined = undefined;
const dynamicHeight: DynamicRowHeight | undefined = undefined;
const listApi: ListImperativeAPI | undefined = undefined;
const gridApi: GridImperativeAPI | undefined = undefined;

export function packageSurfaceProbe() {
	void octaneDevRuntimeDiv;
	void rootMesh;
	void reconcilerRoot;
	void dropzoneState;
	void fileRejections;
	void align;
	void listProps;
	void gridProps;
	void rowProps;
	void cellProps;
	void dynamicHeight;
	void listApi;
	void gridApi;
	return {
		config: config === threeRenderers,
		core: typeof coreApi.createRoot === 'function',
		dropzone:
			typeof Dropzone === 'function' &&
			typeof useDropzone === 'function' &&
			ErrorCode.FileInvalidType === 'file-invalid-type' &&
			dropzoneOptions.maxFiles === 2 &&
			dropzonePublicTypeArity === 13 &&
			dropzonePackage.name === '@octanejs/dropzone',
		iterable: typeof map_iterable === 'function',
		publicApi: typeof publicApi.Canvas === 'function',
		reactWindow:
			typeof Grid === 'function' &&
			typeof List === 'function' &&
			typeof getScrollbarSize === 'function' &&
			typeof useDynamicRowHeight === 'function' &&
			typeof useGridCallbackRef === 'function' &&
			typeof useGridRef === 'function' &&
			typeof useListCallbackRef === 'function' &&
			typeof useListRef === 'function',
		syntax:
			typeof syntaxApi.Prism === 'function' &&
			typeof LightAsync.preload === 'function' &&
			typeof PrismLight.registerLanguage === 'function' &&
			typeof syntaxJavascript === 'function' &&
			typeof syntaxVscDarkPlus === 'object',
		renderer: typeof rendererApi.createUniversalRoot === 'function',
		spread:
			typeof normalize_spread_props === 'function' &&
			typeof normalize_spread_props_for_ref_attr === 'function',
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
					allowImportingTsExtensions: true,
					allowSyntheticDefaultImports: true,
					esModuleInterop: true,
					jsx: 'react-jsx',
					jsxImportSource: 'octane',
					lib: ['dom', 'dom.iterable', 'esnext'],
					module: 'esnext',
					moduleResolution: 'bundler',
					noEmit: true,
					skipLibCheck: false,
					strict: true,
					target: 'esnext',
					types: ['node'],
					plugins: [{ name: '@tsrx/typescript-plugin' }],
				},
				include: ['src/compiler-plugin.ts', 'src/package-surface.ts'],
				tsrx: { compiler: 'octane/compiler/volar' },
			},
			null,
			2,
		) + '\n',
	);
	writeFileSync(
		path.join(consumerDirectory, 'tsconfig.nodenext.json'),
		JSON.stringify(
			{
				compilerOptions: {
					allowImportingTsExtensions: true,
					allowSyntheticDefaultImports: true,
					esModuleInterop: true,
					jsx: 'react-jsx',
					jsxImportSource: 'octane',
					lib: ['dom', 'dom.iterable', 'esnext'],
					module: 'nodenext',
					moduleResolution: 'nodenext',
					noEmit: true,
					resolveJsonModule: true,
					skipLibCheck: false,
					strict: true,
					target: 'esnext',
					types: ['node'],
					plugins: [{ name: '@tsrx/typescript-plugin' }],
				},
				include: ['src/package-surface.ts'],
				tsrx: { compiler: 'octane/compiler/volar' },
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
			'--config.node-linker=hoisted',
		],
		{
			cwd: consumerDirectory,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);

	const consumerRequire = createRequire(path.join(consumerDirectory, 'package.json'));
	const directRuntime = realpathSync(consumerRequire.resolve('octane'));
	// Resolve through real ESM package specifiers from the installed consumer,
	// not a CommonJS-resolved file URL, so conditional `import` branches remain
	// part of the packed contract. React-hosted entries require their intentionally
	// optional React peer and remain covered by the package build's fresh imports.
	const packedRuntimeSpecifiers = Object.keys(REQUIRED_PUBLIC_VALUE_EXPORTS)
		.filter((subpath) => subpath !== './react' && subpath !== './react/server')
		.map((subpath) => [subpath, subpath === '.' ? 'octane' : `octane/${subpath.slice(2)}`]);
	const packedRuntimeExports = JSON.parse(
		execFileSync(
			process.execPath,
			[
				'--input-type=module',
				'-e',
				`const result = Object.create(null);
for (const specifier of ${JSON.stringify(packedRuntimeSpecifiers.map(([, specifier]) => specifier))}) {
	result[specifier] = Object.keys(await import(specifier));
}
process.stdout.write(JSON.stringify(result));`,
			],
			{
				cwd: consumerDirectory,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'inherit'],
				timeout: 30_000,
			},
		),
	);
	for (const [subpath, specifier] of packedRuntimeSpecifiers) {
		assertRequiredPublicValueExports(subpath, packedRuntimeExports[specifier]);
	}
	const bindingEntry = consumerRequire.resolve('@octanejs/hook-form');
	const peerRuntime = realpathSync(createRequire(bindingEntry).resolve('octane'));
	if (peerRuntime !== directRuntime) {
		throw new Error(
			`binding resolved a second Octane runtime:\n  app: ${directRuntime}\n  binding: ${peerRuntime}`,
		);
	}
	const alienSignalsEntry = consumerRequire.resolve('@octanejs/alien-signals');
	const alienSignalsPeerRuntime = realpathSync(createRequire(alienSignalsEntry).resolve('octane'));
	if (alienSignalsPeerRuntime !== directRuntime) {
		throw new Error(
			`Alien Signals binding resolved a second Octane runtime:\n  app: ${directRuntime}\n  binding: ${alienSignalsPeerRuntime}`,
		);
	}
	const dropzoneEntry = consumerRequire.resolve('@octanejs/dropzone');
	const dropzonePackageEntry = consumerRequire.resolve('@octanejs/dropzone/package.json');
	const esmDropzoneEntries = JSON.parse(
		execFileSync(
			process.execPath,
			[
				'--input-type=module',
				'-e',
				`process.stdout.write(JSON.stringify({ root: import.meta.resolve('@octanejs/dropzone'), packageJson: import.meta.resolve('@octanejs/dropzone/package.json') }));`,
			],
			{ cwd: consumerDirectory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
		),
	);
	if (!dropzoneEntry.endsWith(path.join('src', 'index.tsrx'))) {
		throw new Error(`packed CommonJS condition resolved unexpected entry: ${dropzoneEntry}`);
	}
	if (!dropzonePackageEntry.endsWith('package.json')) {
		throw new Error(`packed CommonJS package-json export failed: ${dropzonePackageEntry}`);
	}
	if (!fileURLToPath(esmDropzoneEntries.root).endsWith(path.join('src', 'index.tsrx'))) {
		throw new Error(`packed ESM condition resolved unexpected entry: ${esmDropzoneEntries.root}`);
	}
	if (!fileURLToPath(esmDropzoneEntries.packageJson).endsWith('package.json')) {
		throw new Error(`packed ESM package-json export failed: ${esmDropzoneEntries.packageJson}`);
	}
	const dropzoneRequire = createRequire(dropzoneEntry);
	const dropzonePeerRuntime = realpathSync(dropzoneRequire.resolve('octane'));
	if (dropzonePeerRuntime !== directRuntime) {
		throw new Error(
			`React Dropzone binding resolved a second Octane runtime:\n  app: ${directRuntime}\n  binding: ${dropzonePeerRuntime}`,
		);
	}
	for (const dependency of ['attr-accept', 'file-selector']) {
		dropzoneRequire.resolve(dependency);
	}
	const syntaxEntry = consumerRequire.resolve('@octanejs/syntax-highlighter');
	const syntaxPeerRuntime = realpathSync(createRequire(syntaxEntry).resolve('octane'));
	if (syntaxPeerRuntime !== directRuntime) {
		throw new Error(
			`Syntax Highlighter resolved a second Octane runtime:\n  app: ${directRuntime}\n  binding: ${syntaxPeerRuntime}`,
		);
	}
	const reactWindowEntry = consumerRequire.resolve('@octanejs/window');
	const reactWindowPeerRuntime = realpathSync(createRequire(reactWindowEntry).resolve('octane'));
	if (reactWindowPeerRuntime !== directRuntime) {
		throw new Error(
			`react-window binding resolved a second Octane runtime:\n  app: ${directRuntime}\n  binding: ${reactWindowPeerRuntime}`,
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
	// Isolated pnpm installs record the runtime in .pnpm; a hoisted layout records
	// none there. The concrete directRuntime exists and every binding peer above is
	// asserted equal to it, so only multiple virtual-store runtimes are invalid.
	if (installedRuntimes.length > 1) {
		throw new Error(
			`expected one physical Octane install, found multiple virtual-store entries: ${installedRuntimes.join(', ')}`,
		);
	}

	const compilerPluginEntry = consumerRequire.resolve('octane/compiler/vite');
	const { octane } = await import(pathToFileURL(compilerPluginEntry).href);
	const threeConfigEntry = consumerRequire.resolve('@octanejs/three/config');
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
	const tsrxTsc = path.join(consumerDirectory, 'node_modules', '.bin', 'tsrx-tsc');
	execFileSync(tsrxTsc, ['--noEmit', '-p', 'tsconfig.json'], {
		cwd: consumerDirectory,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	execFileSync(tsrxTsc, ['--noEmit', '-p', 'tsconfig.nodenext.json'], {
		cwd: consumerDirectory,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
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
		!html.includes('data-alien-signals="4"') ||
		!html.includes('name="name"') ||
		!html.includes('data-apollo="connected"') ||
		!html.includes('data-packed-syntax="light"') ||
		!html.includes('data-packed-syntax="prism"') ||
		!html.includes('data-packed-syntax="async"') ||
		!html.includes('packedLight') ||
		!html.includes('packedPrism') ||
		!html.includes('packedAsync') ||
		!html.includes('data-testid="packed-list"') ||
		!html.includes('data-packed-row="0"') ||
		!html.includes('data-testid="packed-grid"') ||
		!html.includes('data-packed-cell="0:0"') ||
		!html.includes('<canvas')
	) {
		throw new Error(`executed packed consumer probe returned unexpected HTML: ${html}`);
	}
	if (Object.values(surface).some((value) => value !== true)) {
		throw new Error(`packed Three subpath probe failed: ${JSON.stringify(surface)}`);
	}

	console.log(
		'installed packed octane + Alien Signals + Hook Form + react-window + Apollo Client + Syntax Highlighter + Three without React; typecheck, Vite client/server builds, subpaths, and executed binding SSR passed',
	);
}

/**
 * Typecheck source-published bindings from their real installed tarballs. A
 * workspace project or plain tsc cannot exercise the TSRX implementation files
 * that become part of a strict external consumer's TypeScript program.
 */
function validatePackedTsrxConsumer(tempRoot, archives, packedFiles, packedManifests) {
	const consumerDirectory = path.join(tempRoot, 'external-tsrx-source-consumer');
	if (isWithinDirectory(REPO_ROOT, consumerDirectory)) {
		throw new Error('packed TSRX source consumer must be created outside the workspace');
	}

	const sourceDirectory = path.join(consumerDirectory, 'src');
	mkdirSync(sourceDirectory, { recursive: true });
	const sourceConsumerPackages = findPackedTsrxSourceConsumerPackages(
		packages,
		packedFiles,
		new Set(packedTsrxSourceExceptions.keys()),
	);
	const sourceConsumerSpecifiers = new Map(
		sourceConsumerPackages
			.filter((packageName) => packageName !== 'octane')
			.map((packageName) => {
				const specifiers = findPackedTsrxSourceConsumerSpecifiers(
					packageName,
					packedManifests.get(packageName),
					packedFiles.get(packageName),
				);
				if (specifiers.length === 0) {
					throw new Error(
						`${packageName} contains published TSRX but has no importable public entry`,
					);
				}
				return [packageName, specifiers];
			}),
	);
	const sourceExceptionNames = new Set(packedTsrxSourceExceptions.keys());
	const browserSourceConsumerSpecifiers = new Map(
		[...sourceConsumerSpecifiers].filter(([packageName]) =>
			findPackedWorkspaceDependencyClosure(packedManifests, [packageName]).every(
				(dependencyName) => !sourceExceptionNames.has(dependencyName),
			),
		),
	);
	const validatedPackages = [...sourceConsumerSpecifiers.keys(), 'octane'];
	const installedPackages = findPackedWorkspaceDependencyClosure(packedManifests, [
		...new Set([...validatedPackages, ...PACKED_TSRX_PROBE_PACKAGES]),
	]);
	const archiveSpecs = Object.fromEntries(
		installedPackages.map((packageName) => [packageName, fileArchiveSpec(archives, packageName)]),
	);
	const externalDependencies = findExternalDependencySpecs(packedManifests, installedPackages);
	const manifest = createPackedTsrxConsumerManifest(
		archiveSpecs,
		{
			nodeTypes: nodeTypesVersion,
			packageManager,
			tsrxTypeScriptPlugin: tsrxTypeScriptPluginVersion,
			typescript: typescriptVersion,
		},
		installedPackages,
		externalDependencies,
	);

	writeFileSync(
		path.join(consumerDirectory, 'package.json'),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
	writeFileSync(
		path.join(consumerDirectory, 'tsconfig.json'),
		`${JSON.stringify(
			createPackedTsrxConsumerConfig({
				nodeTypes: true,
				sourcePackageNames: [...sourceConsumerSpecifiers.keys()],
			}),
			null,
			2,
		)}\n`,
	);
	writeFileSync(
		path.join(consumerDirectory, 'tsconfig.browser.json'),
		`${JSON.stringify(
			createPackedTsrxConsumerConfig({
				consumerSourceFiles: ['src/published-browser-source-imports.ts'],
				nodeTypes: false,
				sourcePackageNames: [...browserSourceConsumerSpecifiers.keys()],
			}),
			null,
			2,
		)}\n`,
	);
	writeFileSync(
		path.join(consumerDirectory, 'pnpm-workspace.yaml'),
		renderPackedExampleWorkspace(archiveSpecs),
	);
	writeFileSync(
		path.join(sourceDirectory, 'PublishedSourceConsumer.tsrx'),
		renderPackedTsrxConsumerSource({ includeRecharts: false }),
	);
	writeFileSync(
		path.join(sourceDirectory, 'published-types.ts'),
		renderPackedTsrxConsumerTypeProbe(),
	);
	writeFileSync(
		path.join(sourceDirectory, 'published-source-imports.ts'),
		renderPackedTsrxSourceImports([...sourceConsumerSpecifiers.values()].flat()),
	);
	writeFileSync(
		path.join(sourceDirectory, 'published-browser-source-imports.ts'),
		renderPackedTsrxSourceImports([...browserSourceConsumerSpecifiers.values()].flat()),
	);

	execFileSync(
		'pnpm',
		['install', '--prefer-offline', '--ignore-scripts', '--no-frozen-lockfile'],
		{
			cwd: consumerDirectory,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);

	const consumerRequire = createRequire(path.join(consumerDirectory, 'package.json'));
	const directRuntime = realpathSync(consumerRequire.resolve('octane'));
	for (const packageName of validatedPackages) {
		const publicSpecifier = sourceConsumerSpecifiers.get(packageName)?.[0] ?? packageName;
		const entry = realpathSync(consumerRequire.resolve(publicSpecifier));
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

	for (const toolingSpecifier of ['@tsrx/typescript-plugin', 'octane/compiler/volar']) {
		const entry = realpathSync(consumerRequire.resolve(toolingSpecifier));
		if (isWithinDirectory(REPO_ROOT, entry)) {
			throw new Error(`${toolingSpecifier} resolved back into the workspace: ${entry}`);
		}
	}

	const tsrxTsc = path.join(consumerDirectory, 'node_modules', '.bin', 'tsrx-tsc');
	for (const project of PACKED_TSRX_CONSUMER_PROJECTS) {
		execFileSync(tsrxTsc, ['--noEmit', '-p', project], {
			cwd: consumerDirectory,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			timeout: 120_000,
		});
	}

	console.log(
		`strict tsrx-tsc validated ${validatedPackages.length - 1} packed TSRX bindings with and without Node ambient types using the installed Octane Volar compiler`,
	);
	for (const [packageName, reason] of packedTsrxSourceExceptions) {
		console.warn(`deferred strict packed TSRX validation for ${packageName}: ${reason}`);
	}
}

async function validatePackedJavascriptConsumer(tempRoot, archives) {
	const consumerDirectory = path.join(tempRoot, 'external-javascript-consumer');
	if (isWithinDirectory(REPO_ROOT, consumerDirectory)) {
		throw new Error('packed JavaScript consumer must be created outside the workspace');
	}
	mkdirSync(consumerDirectory, { recursive: true });
	const archiveSpecs = Object.fromEntries(
		PACKED_JAVASCRIPT_CONSUMER_PACKAGES.map((packageName) => [
			packageName,
			fileArchiveSpec(archives, packageName),
		]),
	);
	writeFileSync(
		path.join(consumerDirectory, 'package.json'),
		`${JSON.stringify(createPackedJavascriptConsumerManifest(archiveSpecs), null, 2)}\n`,
	);
	writeFileSync(
		path.join(consumerDirectory, 'pnpm-workspace.yaml'),
		renderPackedExampleWorkspace(archiveSpecs),
	);
	writeFileSync(path.join(consumerDirectory, 'require.cjs'), renderPackedCommonjsConsumerSource());
	writeFileSync(path.join(consumerDirectory, 'import.mjs'), renderPackedEsmConsumerSource());
	writeFileSync(
		path.join(consumerDirectory, 'draggable-import.mjs'),
		renderPackedDraggableEsmConsumerSource(),
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
	for (const packageName of PACKED_COMMONJS_CONSUMER_PACKAGES) {
		const entry = realpathSync(consumerRequire.resolve(packageName));
		if (!entry.endsWith('.cjs')) {
			throw new Error(`${packageName} require condition did not select CommonJS: ${entry}`);
		}
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
	const serverEntry = realpathSync(consumerRequire.resolve('octane/server'));
	if (!serverEntry.endsWith('.cjs')) {
		throw new Error(`octane/server require condition did not select CommonJS: ${serverEntry}`);
	}
	for (const reactRuntime of ['react', 'react-dom']) {
		try {
			consumerRequire.resolve(reactRuntime);
			throw new Error(`packed CommonJS consumer unexpectedly resolved ${reactRuntime}`);
		} catch (error) {
			if (error.code !== 'MODULE_NOT_FOUND') throw error;
		}
	}
	const commonjsSurface = JSON.parse(
		execFileSync(process.execPath, ['require.cjs'], {
			cwd: consumerDirectory,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			timeout: 30_000,
		}),
	);
	await build({
		absWorkingDir: consumerDirectory,
		entryPoints: ['import.mjs'],
		outfile: 'import-bundle.mjs',
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		logLevel: 'silent',
	});
	const esmSurface = JSON.parse(
		execFileSync(process.execPath, ['import-bundle.mjs'], {
			cwd: consumerDirectory,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			timeout: 30_000,
		}),
	);
	const compilerPluginEntry = consumerRequire.resolve('octane/compiler/vite');
	const { octane } = await import(pathToFileURL(compilerPluginEntry).href);
	const { build: viteBuild } = await import(pathToFileURL(viteToolRequire.resolve('vite')).href);
	await viteBuild({
		root: consumerDirectory,
		configFile: false,
		logLevel: 'silent',
		plugins: [octane({ hmr: false })],
		build: {
			emptyOutDir: true,
			outDir: 'dist',
			rollupOptions: {
				input: path.join(consumerDirectory, 'draggable-import.mjs'),
				output: { entryFileNames: 'draggable-import.mjs' },
			},
			target: 'node22',
		},
	});
	esmSurface.draggable = JSON.parse(
		execFileSync(process.execPath, ['dist/draggable-import.mjs'], {
			cwd: consumerDirectory,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			timeout: 30_000,
		}),
	);
	assertRequiredPublicValueExports('.', commonjsSurface.octane);
	assertRequiredPublicValueExports('.', esmSurface.octane);
	for (const packageName of ['base', 'floating', 'radix']) {
		if (!Array.isArray(commonjsSurface[packageName]) || commonjsSurface[packageName].length === 0) {
			throw new Error(`packed CommonJS ${packageName} surface is empty`);
		}
		if (!Array.isArray(esmSurface[packageName]) || esmSurface[packageName].length === 0) {
			throw new Error(`packed ESM ${packageName} surface is empty`);
		}
	}
	if (!Array.isArray(esmSurface.draggable) || esmSurface.draggable.length === 0) {
		throw new Error('packed ESM draggable surface is empty');
	}
	for (const packageName of ['base', 'floating', 'octane', 'radix']) {
		if (
			JSON.stringify([...commonjsSurface[packageName]].sort()) !==
			JSON.stringify([...esmSurface[packageName]].sort())
		) {
			throw new Error(`packed ESM and CommonJS ${packageName} surfaces differ`);
		}
	}
	if (JSON.stringify(commonjsSurface.ssr) !== JSON.stringify(esmSurface.ssr)) {
		throw new Error('packed ESM and CommonJS SSR output differs');
	}
	console.log(
		'installed packed Octane, Floating UI, Base UI, Radix, and Draggable without React; CommonJS packages selected require conditions and Draggable compiled through its ESM source entry',
	);
}

/**
 * Exercise the private Lynx packages on the Milestone 9 minimum lane exactly
 * as an external application consumes them. This builds and decodes the native
 * artifact but remains a source/build check, not a device-runtime claim. The
 * dedicated compatibility matrix separately exercises the current lane.
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
				engines: { node: '>=22.22.2' },
				dependencies: {
					...LYNX_TOOLCHAIN_LANES.minimum.packages,
					'@octanejs/lynx': archiveSpecs['@octanejs/lynx'],
					'@octanejs/rspack-plugin': archiveSpecs['@octanejs/rspack-plugin'],
					'@octanejs/rspeedy-plugin': archiveSpecs['@octanejs/rspeedy-plugin'],
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
import { useState } from 'octane';

const resource = createLynxNativeResource('packed-resource');
if (resource.id !== 'packed-resource') {
	throw new Error('packed Lynx package root is incomplete');
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
		path.join(sourceDirectory, 'background.ts'),
		`import { root } from '@octanejs/lynx';
import { App } from './App.tsrx';

void root.render(App);
`,
	);
	writeFileSync(
		path.join(consumerDirectory, 'build.mjs'),
		`import { createRspeedy } from '@lynx-js/rspeedy';
import { decode_napi, decode_wasm, supportNapi } from '@lynx-js/tasm';
import { pluginOctane, assertLynxToolchain } from '@octanejs/rspeedy-plugin';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = ${JSON.stringify(consumerDirectory)};
const outputRoot = ${JSON.stringify(outputDirectory)};
const request = createRequire(import.meta.url);
const platformFacade = realpathSync(request.resolve('@octanejs/lynx/platform'));
const testingFacade = realpathSync(request.resolve('@octanejs/lynx/testing'));
const testingEnvironment = realpathSync(request.resolve('@lynx-js/testing-environment'));
const canonicalRoot = realpathSync(root);
const isInstalledHere = (target) => {
	const relative = path.relative(canonicalRoot, target);
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};
if (!isInstalledHere(platformFacade) || !isInstalledHere(testingFacade) || !isInstalledHere(testingEnvironment)) {
	throw new Error('packed Lynx platform/testing facade or its explicit optional peer resolved outside the consumer');
}
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
	'@lynx-js/tasm': '0.0.39',
	'@lynx-js/web-core': '0.22.2',
	'@lynx-js/webpack-runtime-globals': '0.0.7',
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
		source: { entry: { main: './src/background.ts' } },
		splitChunks: false,
		plugins: [pluginOctane({ hmr: false, dev: false }), graphProbe],
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
	if (matchingModules(/\\/@octanejs\\/lynx\\/src\\/main-thread\\.[jt]s$/).length !== 1) {
		throw new Error('production graph did not contain exactly one generated Octane main receiver');
	}
	const forbiddenModule = new RegExp(
		${JSON.stringify(NATIVE_GRAPH_FORBIDDEN_MODULE.source)},
		${JSON.stringify(NATIVE_GRAPH_FORBIDDEN_MODULE.flags)},
	);
	const forbiddenModules = [...modules].filter((identifier) => forbiddenModule.test(identifier));
	if (forbiddenModules.length) {
		throw new Error('production Lynx graph contains DOM or React modules: ' + forbiddenModules.join(', '));
	}

	const bundlePath = path.join(outputRoot, 'main.lynx.bundle');
	if (!existsSync(bundlePath)) {
		throw new Error('production Rspeedy build emitted no main.lynx.bundle');
	}
	const bundle = readFileSync(bundlePath);
	const decoded = supportNapi() ? decode_napi(bundle) : await decode_wasm(bundle);
	const scriptText = (script) => {
		if (typeof script === 'string') return script;
		if (Array.isArray(script)) {
			if (script.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
				return Buffer.from(script).toString('latin1');
			}
			return script.map(scriptText).join('\\n');
		}
		if (script !== null && typeof script === 'object') {
			return Object.values(script).map(scriptText).join('\\n');
		}
		return '';
	};
	const mainThread = scriptText(decoded['main-thread-script']);
	const background = scriptText(decoded['background-thread-script']);
	const completeBundle = scriptText(decoded);
	// The native decoder includes receiver string tables. This describes a
	// first-screen render phase; it is not a reference to the browser global.
	const executableBundle = completeBundle.replaceAll(
		'render window has closed',
		'render phase has closed',
	);
	if (decoded['engine-version'] !== '3.9') {
		throw new Error('packed native bundle targets engine ' + decoded['engine-version'] + ', expected 3.9');
	}
	if (!mainThread.includes('getJSContext') || !background.includes('getCoreContext')) {
		throw new Error('packed native bundle is missing its generated main receiver or background graph');
	}
	if (!background.includes('octane-packed-lynx-compiled')) {
		throw new Error('packed native bundle background section omitted the authored application');
	}
	if (/\\b(?:document|window|HTMLElement|MutationObserver)\\b/.test(executableBundle)) {
		throw new Error('packed native bundle contains a DOM runtime global');
	}
	if (/(?:^|[^$\\w])(?:react|react-dom|preact|ReactLynx)(?:[^$\\w]|$)/i.test(completeBundle)) {
		throw new Error('packed native bundle contains a React runtime reference');
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
			'--strict-peer-dependencies',
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
		'built and decoded one packed Lynx minimum-lane native bundle outside the workspace; exact toolchain, singleton Octane/native core, public subpaths, and DOM/React exclusions passed',
	);
}

const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'octane-pack-check-'));
const failures = [];
const packedArchives = new Map();
const packedFiles = new Map();
const packedManifests = new Map();
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
			packedManifests.set(pkg.name, manifest);
			const files = new Set(
				tarOutput(['-tzf', archive])
					.split('\n')
					.filter(Boolean)
					.map((file) => file.replace(/^package\//, '').replace(/\/$/, '')),
			);
			packedFiles.set(pkg.name, files);
			// `tar -tvzf` prints the stored mode per entry; owner-execute is what
			// decides whether an installed bin is runnable.
			const executableFiles = new Set(
				tarOutput(['-tvzf', archive])
					.split('\n')
					.filter((line) => /^[-l]..x/.test(line))
					.map((line) => line.slice(line.indexOf('package/')))
					.filter(Boolean)
					.map((file) => file.replace(/^package\//, '').replace(/\/$/, '')),
			);
			rawTsrxFiles += [...files].filter((file) => file.endsWith('.tsrx')).length;
			const errors = validatePackedPackage(pkg, manifest, files, executableFiles);
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
				label: 'external strict packed TSRX source consumer',
				run: () =>
					validatePackedTsrxConsumer(tempRoot, packedArchives, packedFiles, packedManifests),
			},
			{
				label: 'external packed JavaScript consumer',
				run: () => validatePackedJavascriptConsumer(tempRoot, packedArchives),
			},
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
