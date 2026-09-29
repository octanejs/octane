/// <reference types="node" />
// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

import * as lynxConfig from '../src/config.js';

type UniversalRendererConfig = {
	readonly module: string;
	readonly threadFunctionsModule?: string;
	readonly target: 'universal';
	readonly capabilities?: readonly string[];
};

const packageDirectory = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageDirectory, '../..');

const PLAIN_SOURCE = `export function App() @{ <view id="simple" /> }`;

const SETUP_BLOCK_SOURCE = `
	export function App(props) @{
		<view>@{
			const value = props.label;
			<text>{value as string}</text>
		}</view>
	}
`;

const STATEFUL_BLOCK_SOURCE = `
	import { useState } from 'octane';

	export function App(props) @{
		<view id="root">
			<text>{'before'}</text>
			@{
				const [count] = useState(props.start);
				const label = props.label + ':' + count;
				<view id="block" bindtap={() => props.onTap(label)}>
					<text>{label as string}</text>
				</view>
			}
			<text>{'after'}</text>
		</view>
	}
`;

type Thread = 'main-thread' | 'background';

// The compiler runs in its own Node process, as in the other Lynx compiler
// tests, because this project's Octane plugin would transform its source.
const COMPILER = JSON.parse(
	execFileSync(
		process.execPath,
		[
			'--input-type=module',
			'-e',
			`import { compile } from './packages/octane/src/compiler/compile.js';
import {
	UNIVERSAL_COMPILER_RUNTIME_IMPORTS,
	UNIVERSAL_RENDERER_HELPER_IMPORTS,
	UNIVERSAL_THREAD_RUNTIME_IMPORTS,
} from './packages/octane/src/compiler/compile-universal.js';
import { lynxBackgroundRenderer, lynxMainThreadRenderer } from './packages/lynx/src/config.runtime.js';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const renderers = { 'main-thread': lynxMainThreadRenderer, background: lynxBackgroundRenderer };
const compiled = {};
for (const [name, source] of Object.entries(JSON.parse(input))) {
	compiled[name] = {};
	for (const [thread, renderer] of Object.entries(renderers)) {
		compiled[name][thread] = compile(source, '/src/App.lynx.tsrx', {
			hmr: false,
			renderer: { ...renderer, id: 'lynx' },
			universalRuntime: { runtime: 'lynx', thread },
		}).code;
	}
}
process.stdout.write(JSON.stringify({
	compiled,
	helperImports: UNIVERSAL_RENDERER_HELPER_IMPORTS.map(([name]) => name),
	runtimeImports: [...UNIVERSAL_COMPILER_RUNTIME_IMPORTS],
	threadImports: [...UNIVERSAL_THREAD_RUNTIME_IMPORTS],
}));`,
		],
		{
			cwd: repositoryRoot,
			encoding: 'utf8',
			input: JSON.stringify({
				plain: PLAIN_SOURCE,
				setupBlock: SETUP_BLOCK_SOURCE,
				statefulBlock: STATEFUL_BLOCK_SOURCE,
			}),
		},
	),
) as {
	readonly compiled: Record<string, Record<Thread, string>>;
	readonly helperImports: readonly string[];
	readonly runtimeImports: readonly string[];
	readonly threadImports: readonly string[];
};

const LYNX_RENDERERS = [
	...new Set(
		Object.values(lynxConfig as Record<string, unknown>).filter(
			(value): value is UniversalRendererConfig =>
				(value as { target?: unknown } | null)?.target === 'universal',
		),
	),
];

// Every export compiled output can name from a renderer's runtime modules. The
// Three host lowering and main-thread callback erasure emit their helpers only
// for the renderers that own them.
function compilerRuntimeImports(renderer: UniversalRendererConfig): Map<string, Set<string>> {
	const imports = new Map<string, Set<string>>();
	const add = (module: string, name: string) => {
		let names = imports.get(module);
		if (names === undefined) imports.set(module, (names = new Set()));
		names.add(name);
	};
	for (const name of COMPILER.helperImports) {
		if (
			(name === 'universalHostComponentLeafPlan' || name === 'registerThreeIntrinsic') &&
			renderer.module !== '@octanejs/three/renderer'
		) {
			continue;
		}
		if (
			name === 'firstScreenEvent' &&
			!renderer.capabilities?.includes('main-thread-render-only')
		) {
			continue;
		}
		add(renderer.module, name);
	}
	add(renderer.module, 'rendererRegion');
	for (const name of COMPILER.runtimeImports) add(renderer.module, name);
	if (renderer.capabilities?.includes('thread-functions')) {
		for (const name of COMPILER.threadImports) {
			add(renderer.threadFunctionsModule ?? renderer.module, name);
		}
	}
	return imports;
}

const LYNX_MODULE_ALIASES = {
	'@octanejs/lynx/main-renderer': resolve(packageDirectory, 'src/main-renderer.ts'),
	'@octanejs/lynx/main-worklets': resolve(packageDirectory, 'src/main-worklets.ts'),
	'@octanejs/lynx/renderer': resolve(packageDirectory, 'src/renderer.ts'),
};

// Links compiled output against this checkout's runtime modules exactly as a
// consumer bundler would; `entry` re-exports what the test drives.
async function bundleCompiled(code: string, entry: string): Promise<Record<string, any>> {
	const result = await build({
		stdin: {
			contents: `${code}\n${entry}\n`,
			resolveDir: packageDirectory,
			sourcefile: 'App.lynx.js',
		},
		alias: LYNX_MODULE_ALIASES,
		bundle: true,
		format: 'iife',
		globalName: 'compiled',
		logLevel: 'silent',
		platform: 'neutral',
		write: false,
	});
	return runInNewContext(`${result.outputFiles[0].text}\ncompiled;`);
}

async function renderMainThread(name: string, props: object): Promise<any> {
	const compiled = await bundleCompiled(
		COMPILER.compiled[name]['main-thread'],
		`export { renderLynxFirstScreen } from '@octanejs/lynx/main-renderer';`,
	);
	return compiled.renderLynxFirstScreen(compiled.App, props).batch;
}

async function renderBackground(name: string, props: object): Promise<any> {
	const compiled = await bundleCompiled(
		COMPILER.compiled[name].background,
		`export { createUniversalRoot } from '@octanejs/lynx/renderer';`,
	);
	const container: { batch: unknown } = { batch: null };
	compiled
		.createUniversalRoot(
			container,
			{
				id: 'lynx',
				capabilities: { text: 'host', visibility: true },
				events: {
					classify(name: string) {
						const match = /^(?:capture-bind|capture-catch|global-bind|bind|catch)([A-Za-z]+)$/.exec(
							name,
						);
						if (match === null) return null;
						return { type: name, priority: match[1] === 'tap' ? 'discrete' : 'default' };
					},
				},
				prepareBatch(target: { batch: unknown }, batch: unknown) {
					return {
						apply() {
							target.batch = batch;
						},
						abort() {},
					};
				},
				getPublicInstance() {
					return null;
				},
			},
			{ scheduleMicrotask: (callback: () => void) => callback() },
		)
		.render(compiled.App, props);
	if (container.batch === null) throw new Error('Background root did not commit.');
	return container.batch;
}

describe('Lynx compiled output links against its renderer runtime', () => {
	it('finds every universal renderer the Lynx configuration exports', () => {
		expect(LYNX_RENDERERS).toContain(lynxConfig.lynxMainThreadRenderer);
		expect(LYNX_RENDERERS).toContain(lynxConfig.lynxBackgroundRenderer);
	});

	it.each(LYNX_RENDERERS.map((renderer) => [renderer.module, renderer] as const))(
		'%s exports every name the compiler can import from it',
		async (_module, renderer) => {
			for (const [module, names] of compilerRuntimeImports(renderer)) {
				const runtime = (await import(/* @vite-ignore */ module)) as Record<string, unknown>;
				expect({
					module,
					missing: [...names].filter((name) => !Object.hasOwn(runtime, name)),
				}).toEqual({ module, missing: [] });
			}
		},
	);

	it('bundles a plain main-thread component', async () => {
		expect(await renderMainThread('plain', {})).toEqual({
			renderer: 'lynx',
			version: 1,
			commands: [
				{ op: 'create', id: 1, type: 'view', props: { id: 'simple' } },
				{ op: 'insert', parent: null, id: 1, before: null },
			],
		});
	});

	it('bundles and renders a setup-bearing child block on the main thread', async () => {
		const batch = await renderMainThread('setupBlock', { label: 'hello' });
		expect(batch.commands).toContainEqual(
			expect.objectContaining({ op: 'create', type: '#text', props: { value: 'hello' } }),
		);
		expect(batch).toEqual(await renderBackground('setupBlock', { label: 'hello' }));
	});

	it('matches the background first tree for a block that owns hooks and events', async () => {
		const props = { label: 'row', start: 3, onTap() {} };
		const main = await renderMainThread('statefulBlock', props);
		expect(main.commands).toContainEqual(
			expect.objectContaining({ op: 'create', type: '#text', props: { value: 'row:3' } }),
		);
		expect(main.commands).toContainEqual(expect.objectContaining({ op: 'event', type: 'bindtap' }));
		expect(main).toEqual(await renderBackground('statefulBlock', props));
	});
});
