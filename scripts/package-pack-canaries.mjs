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
				hasTsrxFile(packedFiles.get(pkg.name)),
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
	if (!hasTsrxFile(files)) return [];

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
		if (collectExportTargets(target).some((entry) => entry.endsWith('.tsrx'))) {
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

export function createPackedTsrxConsumerManifest(
	archiveSpecs,
	toolingVersions,
	packageNames,
	externalDependencies = {},
) {
	const dependencies = { ...externalDependencies };

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
			typescript: toolingVersions.typescript,
		},
	};
}

export function createPackedTsrxConsumerConfig({
	consumerSourceFiles = ['src/**/*.ts', 'src/**/*.tsrx'],
	nodeTypes = true,
	sourcePackageNames = [],
} = {}) {
	return {
		compilerOptions: {
			allowImportingTsExtensions: true,
			jsx: 'react-jsx',
			jsxImportSource: 'octane',
			lib: ['dom', 'dom.iterable', 'es2024'],
			module: 'esnext',
			moduleResolution: 'bundler',
			noEmit: true,
			noErrorTruncation: true,
			plugins: [{ name: '@tsrx/typescript-plugin' }],
			skipLibCheck: false,
			strict: true,
			target: 'es2024',
			types: nodeTypes ? ['node'] : [],
		},
		tsrx: {
			compiler: 'octane/compiler/volar',
		},
		// Compile the installed implementation files directly. A package import can
		// resolve through a declaration condition and otherwise hide shipped TSRX.
		include: [
			...consumerSourceFiles,
			...sourcePackageNames.map((packageName) => `node_modules/${packageName}/**/*.tsrx`),
		],
	};
}

export const PACKED_TSRX_CONSUMER_PROJECTS = ['tsconfig.json', 'tsconfig.browser.json'];

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

export function renderPackedTsrxConsumerSource({ includeRecharts = true } = {}) {
	const rechartsImport = includeRecharts
		? "import { Bar, BarChart, XAxis, YAxis } from '@octanejs/recharts';\n"
		: '';
	const rechartsMarkup = includeRecharts
		? `		<BarChart width={320} height={160} data={[{ name: 'Packed', value: 1 }]}>
			<XAxis dataKey="name" />
			<YAxis />
			<Bar dataKey="value" fill="#8884d8" />
		</BarChart>
`
		: '';
	return `import { Command } from '@octanejs/cmdk';
${rechartsImport}import { animated, useSpring } from '@octanejs/spring';
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
	${rechartsMarkup}		<animated.div style={springStyles}>Packed spring</animated.div>
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
	return `import { Command, type CommandProps } from '@octanejs/cmdk';
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
