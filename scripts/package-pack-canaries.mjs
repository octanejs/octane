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

export const PACKED_TSRX_CONSUMER_PACKAGES = [
	'@octanejs/cmdk',
	'@octanejs/floating-ui',
	'@octanejs/radix',
	'@octanejs/sonner',
	'@octanejs/tiptap',
	'octane',
];

export const PACKED_COMMONJS_CONSUMER_PACKAGES = [
	'@octanejs/base-ui',
	'@octanejs/floating-ui',
	'@octanejs/radix',
	'octane',
];

export function createPackedCommonjsConsumerManifest(archiveSpecs) {
	const dependencies = {};
	for (const packageName of PACKED_COMMONJS_CONSUMER_PACKAGES) {
		const archiveSpec = archiveSpecs[packageName];
		if (typeof archiveSpec !== 'string' || !archiveSpec.startsWith('file:')) {
			throw new Error(`no packed archive was provided for ${packageName}`);
		}
		dependencies[packageName] = archiveSpec;
	}
	return {
		name: 'octane-packed-commonjs-consumer',
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

export function createPackedTsrxConsumerManifest(archiveSpecs, toolingVersions) {
	const dependencies = {};

	for (const packageName of PACKED_TSRX_CONSUMER_PACKAGES) {
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
		engines: { node: '>=22.22.2' },
		dependencies,
		devDependencies: {
			'@tsrx/typescript-plugin': toolingVersions.tsrxTypeScriptPlugin,
			'@types/node': toolingVersions.nodeTypes,
			typescript: toolingVersions.typescript,
		},
	};
}

export function createPackedTsrxConsumerConfig() {
	return {
		compilerOptions: {
			allowImportingTsExtensions: true,
			jsx: 'react-jsx',
			jsxImportSource: 'octane',
			lib: ['dom', 'dom.iterable', 'esnext'],
			module: 'esnext',
			moduleResolution: 'bundler',
			noEmit: true,
			noErrorTruncation: true,
			plugins: [{ name: '@tsrx/typescript-plugin' }],
			skipLibCheck: false,
			strict: true,
			target: 'esnext',
			types: ['node'],
		},
		tsrx: {
			compiler: 'octane/compiler/volar',
		},
		include: ['src/**/*.ts', 'src/**/*.tsrx'],
	};
}

export function renderPackedTsrxConsumerSource() {
	return `import { Command } from '@octanejs/cmdk';
import { toast, Toaster } from '@octanejs/sonner';
import {
	Editor,
	EditorProvider,
	Tiptap,
	useTiptap,
	useTiptapState,
} from '@octanejs/tiptap';
import { useRef } from 'octane';

const editor = new Editor({ extensions: [] });

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

	<section>
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
import { Toaster, useSonner, type ToasterProps } from '@octanejs/sonner';
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
const commandComponentPropsArePrecise: AssertNotAny<Parameters<typeof Command>[0]> = true;
const toasterPropsArePrecise: AssertNotAny<ToasterProps> = true;
const toasterComponentPropsArePrecise: AssertNotAny<Parameters<typeof Toaster>[0]> = true;
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
// @ts-expect-error Toast positions must remain the published position union.
const invalidToaster: ToasterProps = { position: 'middle-center' };
// @ts-expect-error Native CSS properties cannot accept arbitrary booleans.
const invalidToastStyle: ToasterProps = { style: { maxWidth: true } };
// @ts-expect-error CSS custom properties accept strings and numbers, not booleans.
const invalidToastCustomProperty: ToasterProps = { style: { '--consumer-offset': true } };
// @ts-expect-error EditorContent must own an explicit editor, including null.
const invalidEditorContent: EditorContentProps = {};
// @ts-expect-error Tiptap.Content reads its editor from context.
const invalidTiptapContent: TiptapContentProps = { editor: null };

export function verifyTypedEditorSelection(): string {
	return useTiptapState(({ editor }) => editor.getText());
}

export const verifiedPublishedTypes = {
	commandComponentPropsArePrecise,
	commandPropsArePrecise,
	customPropertyToast,
	editorComponentPropsArePrecise,
	editorPropsArePrecise,
	invalidCommand,
	invalidEditorContent,
	invalidTiptapContent,
	invalidToastCustomProperty,
	invalidToastStyle,
	invalidToaster,
	providerComponentPropsArePrecise,
	providerPropsArePrecise,
	tiptapContentPropsArePrecise,
	toastStateIsPrecise,
	toasterComponentPropsArePrecise,
	toasterPropsArePrecise,
};
`;
}
