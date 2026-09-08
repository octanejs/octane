// @vitest-environment node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build as esbuildBuild } from 'esbuild';
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { buildPlaygroundRuntimeManifest } from '../playground-runtime.ts';
import { PROTOCOL_KEY, sandboxSrcdoc } from '../src/lib/playground-sandbox.ts';

type TestWindow = Window & typeof globalThis;
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as {
	JSDOM: new (
		html: string,
		options: {
			runScripts: 'outside-only' | 'dangerously';
			beforeParse?: (window: TestWindow) => void;
		},
	) => { window: TestWindow };
};

describe('playground runtime manifest', () => {
	it('links compiler-only memo helpers to the sandbox runtime singleton', async () => {
		const manifest = await buildPlaygroundRuntimeManifest();
		const privateEntry = manifest.entries['octane/internal/client'];
		expect(privateEntry).toBeTypeOf('string');
		expect(manifest.order).toContain(privateEntry);
		expect(manifest.files[privateEntry]).toBeTypeOf('string');

		const directory = mkdtempSync(join(tmpdir(), 'octane-playground-runtime-'));
		try {
			for (const [name, code] of Object.entries(manifest.files)) {
				writeFileSync(join(directory, name), code);
			}
			// Load the actual code-split artifacts. Independent bundles could
			// expose the same names while silently creating two hook runtimes.
			const publicRuntime = require(join(directory, manifest.entries.octane));
			const privateRuntime = require(join(directory, privateEntry));
			expect(privateRuntime.useMemo).toBe(publicRuntime.useMemo);
			expect(privateRuntime.createRoot).toBe(publicRuntime.createRoot);

			// Link a real compiled custom hook against these exact emitted entry
			// files. Its path-aware memo needs the same active scope as createRoot;
			// merely exposing matching export names from two runtimes is not enough.
			const compiled = compile(
				`import { useMemo } from 'octane';
function useDoubled(value, record) {
	return useMemo(() => { record(value); return value * 2; }, [value]);
}
export function MemoApp({ value, record }) @{
	const doubled = useDoubled(value, record);
	<p>{doubled as string}</p>
}`,
				'playground-memo.tsrx',
				{ hmr: false, dev: false },
			).code;
			const linked = await esbuildBuild({
				stdin: {
					contents:
						compiled +
						`
import { createRoot, flushSync } from 'octane';
const computed = [];
const record = value => computed.push(value);
const root = createRoot(document.getElementById('app'));
const render = value => flushSync(() => root.render(MemoApp, { value, record }));
render(1);
globalThis.__playgroundMemo = { render, computed, dispose: () => root.unmount() };
`,
					loader: 'js',
					resolveDir: directory,
					sourcefile: 'playground-memo.js',
				},
				bundle: true,
				format: 'iife',
				platform: 'browser',
				target: 'esnext',
				logLevel: 'silent',
				write: false,
				plugins: [
					{
						name: 'playground-manifest-entries',
						setup(build) {
							build.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path }) => {
								const entry = manifest.entries[path as keyof typeof manifest.entries];
								return entry === undefined
									? { errors: [{ text: 'Missing playground runtime entry: ' + path }] }
									: { path: join(directory, entry) };
							});
						},
					},
				],
			});
			const rendered = new JSDOM('<!doctype html><div id="app"></div>', {
				runScripts: 'outside-only',
			});
			try {
				rendered.window.eval(linked.outputFiles[0].text);
				const probe = (
					rendered.window as unknown as {
						__playgroundMemo: { render(value: number): void; computed: number[]; dispose(): void };
					}
				).__playgroundMemo;
				expect(rendered.window.document.querySelector('#app')!.innerHTML).toBe('<p>2</p>');
				probe.render(1);
				probe.render(2);
				expect(rendered.window.document.querySelector('#app')!.innerHTML).toBe('<p>4</p>');
				expect(Array.from(probe.computed)).toEqual([1, 2]);
				probe.dispose();
			} finally {
				rendered.window.close();
			}

			const blobs: string[] = [];
			const dom = new JSDOM(sandboxSrcdoc(), {
				runScripts: 'dangerously',
				beforeParse(window: TestWindow) {
					window.URL.createObjectURL = () => {
						const url = 'blob:playground-runtime-' + blobs.length;
						blobs.push(url);
						return url;
					};
				},
			});
			try {
				const ready = new Promise<void>((resolve) => {
					dom.window.addEventListener('message', (event: MessageEvent) => {
						if (event.data?.[PROTOCOL_KEY] === true && event.data.type === 'ready') resolve();
					});
				});
				dom.window.dispatchEvent(
					new dom.window.MessageEvent('message', {
						source: dom.window.parent,
						data: { [PROTOCOL_KEY]: true, type: 'init', manifest },
					}),
				);
				const map = JSON.parse(
					dom.window.document.querySelector('script[type="importmap"]')!.textContent!,
				);
				expect(map.imports['octane/internal/client']).toBe(
					blobs[manifest.order.indexOf(privateEntry)],
				);
				expect(map.imports.octane).toBe(blobs[manifest.order.indexOf(manifest.entries.octane)]);
				expect(map.imports['octane/compiler']).toBeUndefined();
				expect(map.imports['octane/internal/server']).toBeUndefined();
				// jsdom cannot execute blob ESM; the bootstrap still reports that
				// import failure after installing the real import map.
				await ready;
			} finally {
				dom.window.close();
			}
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
