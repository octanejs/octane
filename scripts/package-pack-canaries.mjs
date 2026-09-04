import { realpathSync } from 'node:fs';
import path from 'node:path';

export const NATIVE_GRAPH_FORBIDDEN_MODULE =
	/(?:^|[\\/])(?:runtime(?:\.server)?|universal-dom-boundary|dom-tables)\.[cm]?[jt]sx?$|(?:^|[\\/])hydration(?:[\\/]|\.[cm]?[jt]sx?$)|(?:^|[\\/])(?:react|react-dom|preact)(?:[\\/]|$)|@lynx-js[\\/]react/i;

export function isForbiddenNativeGraphModule(identifier) {
	return NATIVE_GRAPH_FORBIDDEN_MODULE.test(identifier);
}

function collectLocalProtocols(value, label, output) {
	if (typeof value === 'string') {
		if (/^(?:workspace|catalog|link):/.test(value)) output.push({ label, value });
		return;
	}
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index++) {
			collectLocalProtocols(value[index], `${label}[${index}]`, output);
		}
		return;
	}
	if (value && typeof value === 'object') {
		for (const [key, child] of Object.entries(value)) {
			collectLocalProtocols(child, `${label}.${key}`, output);
		}
	}
}

export function isWithinDirectory(directory, target) {
	const relative = path.relative(directory, target);
	return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..');
}

export function createPackedExampleManifest(manifest, archiveSpecs, viteVersion, label) {
	const dependencies = { ...manifest.dependencies, ...archiveSpecs };
	const { pnpm: _packageManagerSettings, ...manifestWithoutPnpmSettings } = manifest;
	const packedManifest = {
		...manifestWithoutPnpmSettings,
		dependencies,
		devDependencies: { vite: viteVersion },
	};
	const unresolved = [];
	collectLocalProtocols(packedManifest, 'package.json', unresolved);
	if (unresolved.length) {
		throw new Error(
			`${label} retains local-only dependency protocols:\n${unresolved
				.map((entry) => `  ${entry.label}: ${entry.value}`)
				.join('\n')}`,
		);
	}
	return packedManifest;
}

export function renderPackedExampleWorkspace(archiveSpecs) {
	const overrides = Object.entries(archiveSpecs)
		.map(([packageName, spec]) => `  ${JSON.stringify(packageName)}: ${JSON.stringify(spec)}`)
		.join('\n');
	return `overrides:\n${overrides}\n`;
}

export const PACKED_COMMONJS_CONSUMER_PACKAGES = [
	'@octanejs/base-ui',
	'@octanejs/floating-ui',
	'@octanejs/radix',
	'octane',
];

export const PACKED_ESM_ONLY_CONSUMER_PACKAGES = ['@octanejs/draggable'];

export const PACKED_JAVASCRIPT_CONSUMER_PACKAGES = [
	...PACKED_COMMONJS_CONSUMER_PACKAGES,
	...PACKED_ESM_ONLY_CONSUMER_PACKAGES,
];

export function createPackedJavascriptConsumerManifest(archiveSpecs) {
	const dependencies = {};
	for (const packageName of PACKED_JAVASCRIPT_CONSUMER_PACKAGES) {
		const archiveSpec = archiveSpecs[packageName];
		if (typeof archiveSpec !== 'string' || !archiveSpec.startsWith('file:')) {
			throw new Error(`no packed archive was provided for ${packageName}`);
		}
		dependencies[packageName] = archiveSpec;
	}
	return {
		name: 'octane-packed-javascript-consumer',
		private: true,
		engines: { node: '>=22' },
		dependencies,
	};
}

export function renderPackedCommonjsConsumerSource() {
	return `const assert = require('node:assert/strict');
const octane = require('octane');
const server = require('octane/server');
const floating = require('@octanejs/floating-ui');
const base = require('@octanejs/base-ui');
const radix = require('@octanejs/radix');

assert.equal(typeof octane.createElement, 'function');
assert.equal(typeof server.renderToString, 'function');
assert.equal(typeof floating.useFloating, 'function');
assert.equal(typeof base.Button, 'function');
assert.equal(typeof radix.Accordion, 'object');
const ssr = server.renderToString(() => 'conditions');
assert.deepEqual(ssr, { html: 'conditions', css: '' });
process.stdout.write(JSON.stringify({
	base: Object.keys(base),
	floating: Object.keys(floating),
	octane: Object.keys(octane),
	radix: Object.keys(radix),
	ssr,
}));
`;
}

export function renderPackedEsmConsumerSource() {
	return `import assert from 'node:assert/strict';
import * as octane from 'octane';
import * as server from 'octane/server';
import * as floating from '@octanejs/floating-ui';
import * as base from '@octanejs/base-ui';
import * as radix from '@octanejs/radix';

assert.equal(typeof octane.createElement, 'function');
assert.equal(typeof server.renderToString, 'function');
assert.equal(typeof floating.useFloating, 'function');
assert.equal(typeof base.Button, 'function');
assert.equal(typeof radix.Accordion, 'object');
const ssr = server.renderToString(() => 'conditions');
assert.deepEqual(ssr, { html: 'conditions', css: '' });
process.stdout.write(JSON.stringify({
	base: Object.keys(base),
	floating: Object.keys(floating),
	octane: Object.keys(octane),
	radix: Object.keys(radix),
	ssr,
}));
`;
}

export function renderPackedDraggableEsmConsumerSource() {
	return `import * as draggable from '@octanejs/draggable';

if (typeof draggable.default !== 'function') {
	throw new Error('packed Draggable default export is not a function');
}
if (typeof draggable.DraggableCore !== 'function') {
	throw new Error('packed DraggableCore export is not a function');
}
process.stdout.write(JSON.stringify(['default', 'DraggableCore'].filter((key) => key in draggable)));
`;
}

export const PACKED_STRICT_BROWSER_SOURCE_PACKAGES = [
	'@octanejs/octane-is',
	'@octanejs/jotai',
	'@octanejs/redux',
	'@octanejs/remix-router',
	'@octanejs/visx',
	'@octanejs/recharts',
];

const strictBrowserSourcePackages = new Set(PACKED_STRICT_BROWSER_SOURCE_PACKAGES);

function hasTypeScriptSource(files) {
	for (const file of files ?? []) {
		if (file.startsWith('src/') && /\.(?:[cm]?ts|tsx)$/.test(file) && !/\.d\.[cm]?ts$/.test(file)) {
			return true;
		}
	}
	return false;
}

function hasPackedSourceConsumer(packageName, files) {
	return (
		hasTsrxFile(files) ||
		(strictBrowserSourcePackages.has(packageName) && hasTypeScriptSource(files))
	);
}

export function findPackedTsrxSourceConsumerPackages(
	packages,
	packedFiles,
	excludedPackages = new Set(),
) {
	const bindingNames = packages
		.filter(
			(pkg) =>
				!pkg.private &&
				pkg.role === 'framework binding' &&
				!excludedPackages.has(pkg.name) &&
				hasPackedSourceConsumer(pkg.name, packedFiles.get(pkg.name)),
		)
		.map((pkg) => pkg.name)
		.sort();

	return [...bindingNames, 'octane'];
}

function hasTsrxFile(files) {
	for (const file of files ?? []) {
		if (file.endsWith('.tsrx')) return true;
	}
	return false;
}

function collectExportTargets(value, output = []) {
	if (typeof value === 'string') {
		output.push(value);
	} else if (value && typeof value === 'object') {
		for (const child of Object.values(value)) collectExportTargets(child, output);
	}
	return output;
}

export function findPackedTsrxSourceConsumerSpecifiers(packageName, manifest, files) {
	if (!hasPackedSourceConsumer(packageName, files)) return [];

	const exports = manifest.exports;
	if (
		typeof exports === 'string' ||
		(exports && !Object.keys(exports).some((key) => key.startsWith('.')))
	) {
		return [packageName];
	}
	if (!exports || typeof exports !== 'object') return manifest.main ? [packageName] : [];

	const specifiers = [];
	for (const [subpath, target] of Object.entries(exports)) {
		if (subpath === '.') {
			specifiers.push(packageName);
			continue;
		}
		if (!subpath.startsWith('./') || subpath.includes('*')) continue;
		if (collectExportTargets(target).some((entry) => /\.(?:[cm]?[jt]sx?|tsrx)$/.test(entry))) {
			specifiers.push(`${packageName}/${subpath.slice(2)}`);
		}
	}
	return specifiers;
}

export function findPackedWorkspaceDependencyClosure(manifests, rootPackageNames) {
	const packageNames = new Set(rootPackageNames);
	const pending = [...rootPackageNames];

	while (pending.length > 0) {
		const packageName = pending.pop();
		const manifest = manifests.get(packageName);
		for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
			for (const dependencyName of Object.keys(manifest?.[field] ?? {})) {
				if (!manifests.has(dependencyName) || packageNames.has(dependencyName)) continue;
				packageNames.add(dependencyName);
				pending.push(dependencyName);
			}
		}
	}

	return [...packageNames].sort();
}

export function findPackedTsrxBrowserSourceConsumerPackages(
	manifests,
	packageNames,
	excludedPackages = new Set(),
) {
	return packageNames.filter((packageName) =>
		findPackedWorkspaceDependencyClosure(manifests, [packageName]).every(
			(dependencyName) =>
				!excludedPackages.has(dependencyName) &&
				manifests.get(dependencyName)?.octane?.sourceEnvironment !== 'node',
		),
	);
}

export function findExternalDependencySpecs(manifests, packageNames) {
	const dependencySpecs = new Map();
	const fields = ['peerDependencies', 'optionalDependencies', 'dependencies'];

	for (const packageName of packageNames) {
		const manifest = manifests.get(packageName);
		for (const [priority, field] of fields.entries()) {
			for (const [dependencyName, spec] of Object.entries(manifest?.[field] ?? {})) {
				if (manifests.has(dependencyName)) continue;
				const existing = dependencySpecs.get(dependencyName);
				if (!existing || priority > existing.priority) {
					dependencySpecs.set(dependencyName, { priority, spec });
				}
			}
		}
	}

	return Object.fromEntries(
		[...dependencySpecs]
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([dependencyName, { spec }]) => [dependencyName, spec]),
	);
}

// The consumer printer must not change the packed compiler's private printer.
// This version exposed duplicated tuple annotations with the unbundled backend.
export const PACKED_TSRX_CONSUMER_ESRAP_VERSION = '2.3.6';

export function createPackedTsrxConsumerManifest(
	archiveSpecs,
	toolingVersions,
	packageNames,
	externalDependencies = {},
) {
	const { esrap: _externalPrinter, ...dependencies } = externalDependencies;

	for (const packageName of packageNames) {
		const archiveSpec = archiveSpecs[packageName];
		if (typeof archiveSpec !== 'string' || !archiveSpec.startsWith('file:')) {
			throw new Error(`no packed archive was provided for ${packageName}`);
		}
		dependencies[packageName] = archiveSpec;
	}

	return {
		name: 'octane-packed-tsrx-source-consumer',
		private: true,
		type: 'module',
		packageManager: toolingVersions.packageManager,
		engines: { node: '>=22.22.2' },
		dependencies,
		devDependencies: {
			'@tsrx/typescript-plugin': toolingVersions.tsrxTypeScriptPlugin,
			'@types/node': toolingVersions.nodeTypes,
			esrap: PACKED_TSRX_CONSUMER_ESRAP_VERSION,
			typescript: toolingVersions.typescript,
		},
	};
}

export const PACKED_TSRX_BROWSER_AMBIENT_FILE = 'browser-ambient.ts';

export function resolvePackedTsrxSourceDirectories(consumerDirectory, packageNames) {
	// TypeScript resolves package imports through their real paths by default.
	// Adding symlink paths as roots checks a second copy of the same modules.
	const realConsumerDirectory = realpathSync(consumerDirectory);
	return [
		...new Set(
			packageNames.map((packageName) =>
				path
					.relative(
						realConsumerDirectory,
						realpathSync(path.join(realConsumerDirectory, 'node_modules', packageName)),
					)
					.split(path.sep)
					.join('/'),
			),
		),
	];
}

export function createPackedTsrxConsumerConfig({
	consumerSourceFiles = ['src/**/*.ts', 'src/**/*.tsrx'],
	ecmaVersion = 'es2024',
	nodeTypes = true,
	sourcePackageDirectories = [],
} = {}) {
	return {
		compilerOptions: {
			allowImportingTsExtensions: true,
			jsx: 'react-jsx',
			jsxImportSource: 'octane',
			lib: ['dom', 'dom.iterable', ecmaVersion],
			module: 'esnext',
			moduleResolution: 'bundler',
			noEmit: true,
			noErrorTruncation: true,
			plugins: [{ name: '@tsrx/typescript-plugin' }],
			skipLibCheck: false,
			strict: true,
			target: ecmaVersion,
			types: nodeTypes ? ['node'] : [],
		},
		tsrx: {
			compiler: 'octane/compiler/volar',
		},
		// Compile the installed implementation files directly. A package import can
		// resolve through a declaration condition and otherwise hide shipped TSRX.
		include: [
			...consumerSourceFiles,
			...(nodeTypes ? [] : [PACKED_TSRX_BROWSER_AMBIENT_FILE]),
			...sourcePackageDirectories.map((directory) => `${directory}/**/*.tsrx`),
		],
	};
}

export const PACKED_TSRX_CONSUMER_PROJECTS = [
	'tsconfig.json',
	'tsconfig.browser.json',
	'tsconfig.strict-browser.json',
];

export function assertPackedTsrxConsumerSucceeded(result, project) {
	const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
	// The language plugin can report a parser failure without failing the
	// TypeScript process. That is not successful validation of the source file.
	if (result.error || result.status !== 0 || /^\[tsrx-tsc\]/m.test(output)) {
		const reason =
			result.error?.message ??
			result.signal ??
			(result.status === 0 ? 'parser diagnostics' : `exit ${result.status}`);
		throw new Error(`${project}: tsrx-tsc failed (${reason})${output ? `\n${output}` : ''}`);
	}
}

// These packages have deliberate API assertions in the hand-authored consumer
// probes. Keep them installed even when source compilation is temporarily
// deferred for one of them.
export const PACKED_TSRX_PROBE_PACKAGES = [
	'@octanejs/cmdk',
	'@octanejs/input-otp',
	'@octanejs/recharts',
	'@octanejs/sonner',
	'@octanejs/spring',
	'@octanejs/syntax-highlighter',
	'@octanejs/textarea-autosize',
	'@octanejs/tiptap',
	'octane',
];

export function renderPackedTsrxSourceImports(specifiers) {
	return (
		specifiers
			.filter((specifier) => specifier !== 'octane')
			.map((specifier) => `import '${specifier}';`)
			.join('\n') + '\n'
	);
}

export function renderPackedTsrxBrowserAmbientProbe() {
	return `// These errors must remain present even when imported declarations request Node types.
// @ts-expect-error Browser consumers do not have a process global.
process.env.NODE_ENV;
// @ts-expect-error Browser consumers do not have a Buffer global.
Buffer.from('browser');
// @ts-expect-error Browser consumers do not have the NodeJS namespace.
export type BrowserHasNoNodeNamespace = NodeJS.Process;
`;
}

// Pure TypeScript introspection bindings also need packed Node and browser
// source checks, even though they do not author a TSRX component.
function renderPackedOctaneIsTypeProbe() {
	return `import * as PackedIs from '@octanejs/octane-is';
import type { ElementDescriptor as PackedIsDescriptor } from 'octane';
type PackedIsEqual<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type PackedIsAssert<T extends true> = T;
type PackedIsExports = PackedIsAssert<PackedIsEqual<keyof typeof PackedIs, 'ContextConsumer' | 'ContextProvider' | 'Element' | 'ForwardRef' | 'Fragment' | 'Lazy' | 'Memo' | 'Portal' | 'Profiler' | 'StrictMode' | 'Suspense' | 'SuspenseList' | 'isValidElementType' | 'isContextConsumer' | 'isContextProvider' | 'isForwardRef' | 'isFragment' | 'isLazy' | 'isMemo' | 'isPortal' | 'isProfiler' | 'isStrictMode' | 'isSuspense' | 'isSuspenseList' | 'typeOf' | 'isElement'>>;
type PackedIsContextConsumer = PackedIsAssert<PackedIsEqual<typeof PackedIs.ContextConsumer, symbol>>;
type PackedIsContextProvider = PackedIsAssert<PackedIsEqual<typeof PackedIs.ContextProvider, symbol>>;
type PackedIsElement = PackedIsAssert<PackedIsEqual<typeof PackedIs.Element, symbol>>;
type PackedIsForwardRef = PackedIsAssert<PackedIsEqual<typeof PackedIs.ForwardRef, symbol>>;
type PackedIsFragment = PackedIsAssert<PackedIsEqual<typeof PackedIs.Fragment, symbol>>;
type PackedIsLazy = PackedIsAssert<PackedIsEqual<typeof PackedIs.Lazy, symbol>>;
type PackedIsMemo = PackedIsAssert<PackedIsEqual<typeof PackedIs.Memo, symbol>>;
type PackedIsPortal = PackedIsAssert<PackedIsEqual<typeof PackedIs.Portal, symbol>>;
type PackedIsProfiler = PackedIsAssert<PackedIsEqual<typeof PackedIs.Profiler, symbol>>;
type PackedIsStrictMode = PackedIsAssert<PackedIsEqual<typeof PackedIs.StrictMode, symbol>>;
type PackedIsSuspense = PackedIsAssert<PackedIsEqual<typeof PackedIs.Suspense, symbol>>;
type PackedIsSuspenseList = PackedIsAssert<PackedIsEqual<typeof PackedIs.SuspenseList, symbol>>;
type PackedIsisValidElementType = PackedIsAssert<PackedIsEqual<typeof PackedIs.isValidElementType, (value: unknown) => boolean>>;
type PackedIsisContextConsumer = PackedIsAssert<PackedIsEqual<typeof PackedIs.isContextConsumer, (value: unknown) => boolean>>;
type PackedIsisContextProvider = PackedIsAssert<PackedIsEqual<typeof PackedIs.isContextProvider, (value: unknown) => boolean>>;
type PackedIsisForwardRef = PackedIsAssert<PackedIsEqual<typeof PackedIs.isForwardRef, (value: unknown) => boolean>>;
type PackedIsisFragment = PackedIsAssert<PackedIsEqual<typeof PackedIs.isFragment, (value: unknown) => boolean>>;
type PackedIsisLazy = PackedIsAssert<PackedIsEqual<typeof PackedIs.isLazy, (value: unknown) => boolean>>;
type PackedIsisMemo = PackedIsAssert<PackedIsEqual<typeof PackedIs.isMemo, (value: unknown) => boolean>>;
type PackedIsisPortal = PackedIsAssert<PackedIsEqual<typeof PackedIs.isPortal, (value: unknown) => boolean>>;
type PackedIsisProfiler = PackedIsAssert<PackedIsEqual<typeof PackedIs.isProfiler, (value: unknown) => boolean>>;
type PackedIsisStrictMode = PackedIsAssert<PackedIsEqual<typeof PackedIs.isStrictMode, (value: unknown) => boolean>>;
type PackedIsisSuspense = PackedIsAssert<PackedIsEqual<typeof PackedIs.isSuspense, (value: unknown) => boolean>>;
type PackedIsisSuspenseList = PackedIsAssert<PackedIsEqual<typeof PackedIs.isSuspenseList, (value: unknown) => boolean>>;
type PackedIsTypeOf = PackedIsAssert<PackedIsEqual<typeof PackedIs.typeOf, (value: unknown) => symbol | undefined>>;
type PackedIsElementGuard = PackedIsAssert<PackedIsEqual<typeof PackedIs.isElement, (value: unknown) => value is PackedIsDescriptor<unknown>>>;
// @ts-expect-error Kind labels are symbols, not strings.
const packedIsWrong: string = PackedIs.typeOf(null);
// @ts-expect-error Predicates require a value.
PackedIs.isMemo();
// @ts-expect-error Kind labels are not component factories.
PackedIs.Profiler();
void packedIsWrong;
`;
}

export function renderPackedStrictBrowserConsumerTypeProbe() {
	return `${renderPackedOctaneIsTypeProbe()}
import { sumTypedPair } from './App.tsrx';
import { compileToVolarMappings, compileTypesInspection } from 'octane/compiler/volar';
import { atom, useAtom } from '@octanejs/jotai';
import { useSelector } from '@octanejs/redux';
import { Form, Link, NavLink } from '@octanejs/remix-router';
import { Group } from '@octanejs/visx/group';
import {
	Bar,
	BarChart,
	Area,
	Funnel,
	Line,
	Pie,
	PolarAngleAxis,
	PolarRadiusAxis,
	Scatter,
	XAxis,
	YAxis,
	type BarProps,
	type BarShapeProps,
	type AreaProps,
	type PieProps,
	type RechartsProps,
	type BrushProps,
	type TreemapProps,
} from '@octanejs/recharts';
// @ts-expect-error Brush is not supported by the Octane runtime port.
import { Brush } from '@octanejs/recharts';
// @ts-expect-error Treemap is not supported by the Octane runtime port.
import { Treemap } from '@octanejs/recharts';

type AssertNotAny<T> = 0 extends 1 & T ? never : true;
export function verifyPackedCompilerTypes() {
	const mappings = compileToVolarMappings('export const value = 1;', 'Probe.tsrx');
	const inspection = compileTypesInspection('export const value = 1;', 'Probe.tsrx');
	const generatedCode: string = mappings.code;
	const inspectedCode: string = inspection.code;
	const sourceOffset: number = mappings.mappings[0].sourceOffsets[0];
	const sourceStart: number = inspection.segments[0].srcStart;
	// @ts-expect-error Compiler source inputs are strings, not arbitrary objects.
	compileToVolarMappings({});
	// @ts-expect-error Inspection source inputs keep the same string contract.
	compileTypesInspection({});
	// @ts-expect-error Bundling must not erase the generated code's string type.
	const invalidGeneratedCode: number = mappings.code;
	// @ts-expect-error Inspection code remains a string after bundling.
	const invalidInspectedCode: number = inspection.code;
	// @ts-expect-error Mapping offsets must not degrade to any.
	const invalidSourceOffset: string = mappings.mappings[0].sourceOffsets[0];
	// @ts-expect-error Inspection ranges remain numeric.
	const invalidSourceStart: string = inspection.segments[0].srcStart;
	return { generatedCode, inspectedCode, sourceOffset, sourceStart,
		invalidGeneratedCode, invalidInspectedCode, invalidSourceOffset, invalidSourceStart };
}
const tupleTotal: number = sumTypedPair([1, 2]);
// @ts-expect-error A typed array parameter accepts one tuple, not two arguments.
sumTypedPair(1, 2);
// @ts-expect-error Typed tuple members must keep their authored element types.
sumTypedPair([1, 'two']);
const barDataKeyIsTyped: AssertNotAny<BarProps['dataKey']> = true;
const barShapeXIsTyped: AssertNotAny<BarShapeProps['x']> = true;
const barEventIsTyped: AssertNotAny<Parameters<NonNullable<BarProps['onClick']>>[2]> = true;
const typedBarShapeX: BarShapeProps['x'] = 1;
// @ts-expect-error Shape geometry must be numeric, not unknown or a broad prop bag.
const invalidBarShapeX: BarShapeProps['x'] = 'one';

const typedBar: BarProps = {
	dataKey: 'value',
	onClick(_data, _index, event) {
		const nativeEvent: MouseEvent = event;
		const nativeTarget: SVGGElement = event.currentTarget;
		// @ts-expect-error Octane callbacks receive native events, not synthetic events.
		event.nativeEvent;
		void [nativeEvent, nativeTarget];
	},
};
const chartRef: { current: SVGSVGElement | null } = { current: null };
const typedChart: Parameters<typeof BarChart>[0] = {
	data: [{ value: 1 }], width: 320, height: 160,
	ref: [chartRef, [(_node: SVGSVGElement | null) => {}]],
};
const typedArea: AreaProps<{ value: number }, number> = { dataKey: (entry) => entry.value };
const typedPie: PieProps<{ value: number }, number> = { dataKey: (entry) => entry.value };
type Datum = { value: number };
type TypedSeriesProps = Parameters<typeof Bar<Datum, number>>[0];
const genericBar: TypedSeriesProps = { dataKey: (entry) => entry.value, stackId: 'stack' };
const numericStackedBar: Parameters<typeof Bar<{ 0: number }, number>>[0] = { dataKey: 0, stackId: 'stack' };
const genericArea: Parameters<typeof Area<Datum, number>>[0] = { dataKey: (entry) => entry.value };
const genericFunnel: Parameters<typeof Funnel<Datum, number>>[0] = { dataKey: (entry) => entry.value };
const genericLine: Parameters<typeof Line<Datum, number>>[0] = { dataKey: (entry) => entry.value };
const genericPie: Parameters<typeof Pie<Datum, number>>[0] = { dataKey: (entry) => entry.value };
const genericScatter: Parameters<typeof Scatter<Datum, number>>[0] = { dataKey: (entry) => entry.value };
const genericXAxis: Parameters<typeof XAxis<Datum, number>>[0] = { dataKey: (entry) => entry.value };
const genericYAxis: Parameters<typeof YAxis<Datum, number>>[0] = { dataKey: (entry) => entry.value };
// @ts-expect-error Generic component data-key callbacks keep the chosen datum shape.
const invalidGenericDataKey: TypedSeriesProps = { dataKey: (entry) => entry.missing };
// @ts-expect-error Funnel's built-in name default must not erase its public datum type.
const invalidFunnelDataKey: Parameters<typeof Funnel<Datum, number>>[0] = { dataKey: (entry) => entry.missing };

// @ts-expect-error Bar data keys must not accept booleans through a broad prop bag.
const invalidBar: BarProps = { dataKey: true };
// @ts-expect-error The component must use the same checked data-key contract.
const invalidBarComponent: Parameters<typeof Bar>[0] = { dataKey: true };
// @ts-expect-error Chart refs point at SVG roots and do not accept legacy strings.
const invalidChartRef: Parameters<typeof BarChart>[0] = { ref: 'legacy' };
const typedPolarAngleAxis: Parameters<typeof PolarAngleAxis>[0] = {
	onClick(_data, _index, event) {
		const group: SVGGElement = event.currentTarget;
		// @ts-expect-error Axis events target the enclosing group, not a text node.
		event.currentTarget.getComputedTextLength();
		void group;
	},
	tick: { ref: (node: SVGTextElement | null) => { node?.getComputedTextLength(); } },
};
const typedPolarRadiusAxis: Parameters<typeof PolarRadiusAxis>[0] = {
	onScroll(_data, _index, event) {
		const group: SVGGElement = event.currentTarget;
		// @ts-expect-error Axis events target the enclosing group, not a text node.
		event.currentTarget.getComputedTextLength();
		void group;
	},
	tick: { ref: (node: SVGTextElement | null) => { node?.getComputedTextLength(); } },
};

const typedLink: Parameters<typeof Link>[0] = {
	to: '/packed',
	ref: { current: null },
	onClick(event) {
		const nativeEvent: MouseEvent = event;
		// @ts-expect-error Link callbacks do not expose a synthetic event wrapper.
		event.nativeEvent;
		void nativeEvent;
	},
};
const typedForm: Parameters<typeof Form>[0] = {
	ref: { current: null },
	onSubmit(event) {
		const submitter: HTMLElement | null = event.submitter;
		// @ts-expect-error Form callbacks receive the native SubmitEvent.
		event.nativeEvent;
		void submitter;
	},
};
// @ts-expect-error Link refs must receive anchors, not buttons.
const invalidLinkRef: Parameters<typeof Link>[0] = { to: '/', ref: (_node: HTMLButtonElement | null) => {} };
// @ts-expect-error Form refs must receive forms, not anchors.
const invalidFormRef: Parameters<typeof Form>[0] = { ref: (_node: HTMLAnchorElement | null) => {} };
// @ts-expect-error NavLink must retain Link's anchor ref contract.
const invalidNavLinkRef: Parameters<typeof NavLink>[0] = { to: '/', ref: (_node: HTMLButtonElement | null) => {} };
const typedGroup: Parameters<typeof Group>[0] = {
	left: 2,
	ref: [{ current: null }, [(_node: SVGGElement | null) => {}]],
};
// @ts-expect-error Visx group offsets are numeric.
const invalidGroupOffset: Parameters<typeof Group>[0] = { left: 'two' };

const counter = atom(0);
export function verifyStrictBindingHooks(): number {
	const [count, setCount] = useAtom(counter);
	const selected = useSelector((state: { count: number }) => state.count);
	const countIsTyped: AssertNotAny<typeof count> = true;
	const selectedIsTyped: AssertNotAny<typeof selected> = true;
	setCount(count + 1);
	// @ts-expect-error A numeric atom must reject string updates.
	setCount('not-a-number');
	// @ts-expect-error Typed Redux selections must not degrade to any.
	const invalidSelection: string = selected;
	void [countIsTyped, selectedIsTyped, invalidSelection];
	return count + selected;
}

// Deprecated bags remain type-only compatibility exports. Actual components
// above must never acquire these broad contracts again.
const legacyProps: RechartsProps = { width: 320 };
const legacyBrush: BrushProps = { dataKey: 'value' };
const legacyTreemap: TreemapProps = { data: [] };
export const verifiedStrictBrowserTypes = {
	tupleTotal,
	barDataKeyIsTyped, barShapeXIsTyped, barEventIsTyped, typedBarShapeX, invalidBarShapeX,
	typedBar, typedChart, typedArea, typedPie, typedPolarAngleAxis, typedPolarRadiusAxis,
	typedLink, typedForm, typedGroup,
	genericBar, numericStackedBar, genericArea, genericFunnel, genericLine, genericPie, genericScatter, genericXAxis, genericYAxis,
	invalidBar, invalidBarComponent, invalidChartRef, invalidLinkRef, invalidFormRef, invalidNavLinkRef,
	invalidGroupOffset, invalidGenericDataKey, invalidFunnelDataKey,
	legacyProps, legacyBrush, legacyTreemap,
};
`;
}

export function renderPackedStrictBrowserConsumerSource() {
	return `import { atom, useAtom } from '@octanejs/jotai';
import { Provider, useSelector } from '@octanejs/redux';
import { Form, Link, MemoryRouter, NavLink } from '@octanejs/remix-router';
import { Group } from '@octanejs/visx/group';
import { Bar, BarChart, XAxis, YAxis } from '@octanejs/recharts';
import { useRef } from 'octane';
import { createStore } from 'redux';

export function sumTypedPair([first, second]: [number, number]): number {
	return first + second;
}

const counter = atom(0);
const store = createStore((state = { count: 1 }) => state);

function BindingContents() @{
	const [count, setCount] = useAtom(counter);
	const selected = useSelector((state: { count: number }) => state.count);
	const groupRef = useRef<SVGGElement | null>(null);
	const chartRef = useRef<SVGSVGElement | null>(null);
	<section>
		<Link to="/packed" ref={{ current: null }}>Packed link</Link>
		<NavLink to="/packed">Packed navigation</NavLink>
		<Form method="get" onSubmit={(event) => event.preventDefault()}>
			<button type="button" onClick={() => setCount(count + 1)}>{String(count + selected)}</button>
		</Form>
		<svg><Group left={2} ref={[groupRef, undefined]}><circle r={2} /></Group></svg>
		<BarChart width={320} height={160} data={[{ value: count }]} ref={[chartRef, undefined]}>
			<XAxis dataKey="value" />
			<YAxis />
			<Bar dataKey="value" isAnimationActive={false} />
		</BarChart>
	</section>
}

export function PackedStrictBrowserConsumer() @{
	<Provider store={store}><MemoryRouter><BindingContents /></MemoryRouter></Provider>
}
`;
}

export function renderPackedTsrxConsumerSource() {
	return `import { Command } from '@octanejs/cmdk';
import { Bar, BarChart, XAxis, YAxis } from '@octanejs/recharts';
import { animated, useSpring } from '@octanejs/spring';
import { Parallax, ParallaxLayer } from '@octanejs/spring/parallax';
import { OTPInput, REGEXP_ONLY_DIGITS } from '@octanejs/input-otp';
import { toast, Toaster } from '@octanejs/sonner';
import { Light } from '@octanejs/syntax-highlighter';
import javascript from '@octanejs/syntax-highlighter/dist/esm/languages/hljs/javascript';
import docco from '@octanejs/syntax-highlighter/dist/esm/styles/hljs/docco';
import TextareaAutosize from '@octanejs/textarea-autosize';
import {
	Editor,
	EditorProvider,
	Tiptap,
	useTiptap,
	useTiptapState,
} from '@octanejs/tiptap';
import { useRef } from 'octane';

const editor = new Editor({ extensions: [] });
Light.registerLanguage('javascript', javascript);

function EditorStateProbe() @{
	const currentEditor = useTiptap();
	const text: string = useTiptapState(({ editor: selectedEditor }) =>
		selectedEditor.getText(),
	);

	<output data-editor-ready={currentEditor.editor === editor}>{text}</output>
}

export function PublishedSourceConsumer() @{
	const commandRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const toasterRef = useRef<HTMLElement | null>(null);
	const [springStyles] = useSpring({ from: { opacity: 0 }, to: { opacity: 1 } });

	<section>
		<BarChart width={320} height={160} data={[{ name: 'Packed', value: 1 }]}>
			<XAxis dataKey="name" />
			<YAxis />
			<Bar dataKey="value" fill="#8884d8" />
		</BarChart>
		<animated.div style={springStyles}>Packed spring</animated.div>
		<div style={{ height: 120 }}>
			<Parallax pages={2}>
				<ParallaxLayer offset={1} speed={0.5}>Packed Parallax</ParallaxLayer>
			</Parallax>
		</div>
		<Command ref={commandRef} label="Commands">
			<Command.Input ref={inputRef} placeholder="Search commands" />
			<Command.List>
				<Command.Item
					value="document"
					onSelect={(value: string) => toast.success(value)}
				>
					Open document
				</Command.Item>
			</Command.List>
		</Command>
		<Toaster
			ref={toasterRef}
			position="bottom-right"
			style={{ '--consumer-offset': '8px', maxWidth: 360 }}
		/>
		<OTPInput
			maxLength={6}
			pattern={REGEXP_ONLY_DIGITS}
			aria-label="Verification code"
		>
			<span>Verification slots</span>
		</OTPInput>
		<label>
			Message
		<TextareaAutosize minRows={2} maxRows={6} defaultValue="Packed source" />
		</label>
		<Light language="javascript" style={docco} showLineNumbers>
			{'const packed = true;'}
		</Light>
		<EditorProvider
			extensions={[]}
			immediatelyRender={false}
			editorContainerProps={{ 'data-editor-host': 'strict-consumer' }}
		>
			<span>Deferred editor</span>
		</EditorProvider>
		<Tiptap editor={editor}>
			<EditorStateProbe />
			<Tiptap.Content data-editor-host="provided-editor" />
		</Tiptap>
	</section>
}
`;
}

export function renderPackedTsrxConsumerTypeProbe() {
	return `${renderPackedOctaneIsTypeProbe()}
import { Command, type CommandProps } from '@octanejs/cmdk';
import {
	Bar,
	BarChart,
	Cell,
	ErrorBar,
	Layer,
	Surface,
	useChartWidth,
	type BarProps,
} from '@octanejs/recharts';
// @ts-expect-error Brush is not supported by the Octane runtime port.
import { Brush } from '@octanejs/recharts';
// @ts-expect-error Treemap is not supported by the Octane runtime port.
import { Treemap } from '@octanejs/recharts';
import { Controller, SpringValue, type ControllerUpdate } from '@octanejs/spring';
import type { IParallax, ParallaxProps } from '@octanejs/spring/parallax';
import { OTPInput, type OTPInputProps } from '@octanejs/input-otp';
import { Toaster, useSonner, type ToasterProps } from '@octanejs/sonner';
import SyntaxHighlighter, { type SyntaxHighlighterProps } from '@octanejs/syntax-highlighter';
import TextareaAutosize, { type TextareaAutosizeProps } from '@octanejs/textarea-autosize';
import {
	EditorContent,
	EditorProvider,
	Tiptap,
	useTiptapState,
	type EditorContentProps,
	type EditorProviderProps,
	type TiptapContentProps,
} from '@octanejs/tiptap';

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertNotAny<T> = IsAny<T> extends false ? true : never;

const commandPropsArePrecise: AssertNotAny<CommandProps> = true;
const rechartsBarPropsArePrecise: AssertNotAny<BarProps> = true;
const rechartsBarComponentPropsArePrecise: AssertNotAny<Parameters<typeof Bar>[0]> = true;
const rechartsChartComponentPropsArePrecise: AssertNotAny<Parameters<typeof BarChart>[0]> = true;
const rechartsCellIsTyped: AssertNotAny<typeof Cell> = true;
const rechartsErrorBarIsTyped: AssertNotAny<typeof ErrorBar> = true;
const rechartsLayerIsTyped: AssertNotAny<typeof Layer> = true;
const rechartsSurfaceIsTyped: AssertNotAny<typeof Surface> = true;
const rechartsWidthHookIsTyped: AssertNotAny<typeof useChartWidth> = true;
const springValueIsPrecise: AssertNotAny<SpringValue<number>> = true;
const controllerUpdateIsPrecise: AssertNotAny<ControllerUpdate<{ x: number }>> = true;
const parallaxPropsArePrecise: AssertNotAny<ParallaxProps> = true;
const parallaxApiIsPrecise: AssertNotAny<IParallax> = true;
const springController = new Controller<{ x: number }>({ from: { x: 0 } });
const springPosition: number = springController.springs.x.get();
const commandComponentPropsArePrecise: AssertNotAny<Parameters<typeof Command>[0]> = true;
const otpPropsArePrecise: AssertNotAny<OTPInputProps> = true;
const otpComponentPropsArePrecise: AssertNotAny<Parameters<typeof OTPInput>[0]> = true;
const toasterPropsArePrecise: AssertNotAny<ToasterProps> = true;
const toasterComponentPropsArePrecise: AssertNotAny<Parameters<typeof Toaster>[0]> = true;
const textareaPropsArePrecise: AssertNotAny<TextareaAutosizeProps> = true;
const textareaComponentPropsArePrecise: AssertNotAny<Parameters<typeof TextareaAutosize>[0]> = true;
const syntaxPropsArePrecise: AssertNotAny<SyntaxHighlighterProps> = true;
const syntaxComponentPropsArePrecise: AssertNotAny<Parameters<typeof SyntaxHighlighter>[0]> = true;
const toastStateIsPrecise: AssertNotAny<ReturnType<typeof useSonner>> = true;
const editorPropsArePrecise: AssertNotAny<EditorContentProps> = true;
const editorComponentPropsArePrecise: AssertNotAny<Parameters<typeof EditorContent>[0]> = true;
const providerPropsArePrecise: AssertNotAny<EditorProviderProps> = true;
const providerComponentPropsArePrecise: AssertNotAny<Parameters<typeof EditorProvider>[0]> = true;
const tiptapContentPropsArePrecise: AssertNotAny<Parameters<typeof Tiptap.Content>[0]> = true;

const customPropertyToast: ToasterProps = {
	position: 'bottom-right',
	style: { '--consumer-offset': '8px', maxWidth: 360 },
};

// @ts-expect-error Command callbacks receive the selected string.
const invalidCommand: CommandProps = { onValueChange: (value: number) => value };
// @ts-expect-error maxLength is required.
const invalidOtp: OTPInputProps = { children: 'slots' };
// @ts-expect-error Toast positions must remain the published position union.
const invalidToaster: ToasterProps = { position: 'middle-center' };
// @ts-expect-error Native CSS properties cannot accept arbitrary booleans.
const invalidToastStyle: ToasterProps = { style: { maxWidth: true } };
// @ts-expect-error CSS custom properties accept strings and numbers, not booleans.
const invalidToastCustomProperty: ToasterProps = { style: { '--consumer-offset': true } };
// @ts-expect-error TextareaAutosize owns vertical sizing through row bounds.
const invalidTextareaStyle: TextareaAutosizeProps = { style: { minHeight: 20 } };
// @ts-expect-error Highlighted children are source text, not arbitrary nodes.
const invalidSyntaxChildren: SyntaxHighlighterProps = { children: 42 };
// @ts-expect-error EditorContent must own an explicit editor, including null.
const invalidEditorContent: EditorContentProps = {};
// @ts-expect-error Tiptap.Content reads its editor from context.
const invalidTiptapContent: TiptapContentProps = { editor: null };

export function verifyTypedEditorSelection(): string {
	return useTiptapState(({ editor }) => editor.getText());
}

export const verifiedPublishedTypes = {
	commandComponentPropsArePrecise,
	controllerUpdateIsPrecise,
	commandPropsArePrecise,
	customPropertyToast,
	editorComponentPropsArePrecise,
	editorPropsArePrecise,
	invalidCommand,
	invalidOtp,
	invalidEditorContent,
	invalidTiptapContent,
	invalidToastCustomProperty,
	invalidToastStyle,
	invalidTextareaStyle,
	invalidSyntaxChildren,
	invalidToaster,
	providerComponentPropsArePrecise,
	providerPropsArePrecise,
	rechartsBarComponentPropsArePrecise,
	rechartsBarPropsArePrecise,
	rechartsChartComponentPropsArePrecise,
	rechartsCellIsTyped,
	rechartsErrorBarIsTyped,
	rechartsLayerIsTyped,
	rechartsSurfaceIsTyped,
	rechartsWidthHookIsTyped,
	parallaxApiIsPrecise,
	parallaxPropsArePrecise,
	springController,
	springPosition,
	springValueIsPrecise,
	otpComponentPropsArePrecise,
	otpPropsArePrecise,
	tiptapContentPropsArePrecise,
	toastStateIsPrecise,
	toasterComponentPropsArePrecise,
	toasterPropsArePrecise,
	textareaComponentPropsArePrecise,
	textareaPropsArePrecise,
	syntaxComponentPropsArePrecise,
	syntaxPropsArePrecise,
};
`;
}
