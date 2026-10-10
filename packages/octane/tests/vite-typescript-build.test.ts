import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { build } from 'vite';
import { octane } from 'octane/compiler/vite';
import { decodeMappings } from './_source-map.js';

const PACKAGE_ROOT = resolve(import.meta.dirname, '..');

type Fixture = {
	failLeft(): never;
	failRight(): never;
	failHelper(): never;
	registrations: string[];
	render(suffix: string): string;
	mount(
		container: HTMLElement,
		suffix: string,
	): {
		click(button: HTMLButtonElement): void;
		unmount(): void;
	};
};

function sources(revision: number) {
	const panels = Object.fromEntries(
		['left', 'right'].map((side, index) => [
			`${side}/Panel.tsrx`,
			`${'\n'.repeat(revision * 4 + index * 2)}import { format, useCount, type Suffix } from '../helper.ts';
import { unusedValue } from '../register.ts';

export function fail(): never {
	throw new Error('${side} failure ${revision}');
}

export function Panel(props: { suffix: Suffix }) @{
	const [count, setCount] = useCount();
	<button data-side="${side}" onClick={() => setCount(count + 1)}>
		{format('${side}-${revision}', props.suffix, count) as string}
	</button>
}
`,
		]),
	);
	return {
		...panels,
		'helper.ts': `${'\n'.repeat(revision * 3)}import { useState } from 'octane';
export type Suffix = string;
export enum Step { One = 1 }
export function useCount() {
	return useState(1);
}
export function format(side: string, suffix: Suffix, count: number): string {
	return side + ':' + suffix + ':' + (count * Step.One);
}
export function failHelper(): never {
	throw new Error('helper failure ${revision}');
}
`,
		'registry.ts': 'export const registrations: string[] = [];\n',
		'register.ts': `import { registrations } from './registry.ts';
registrations.push('loaded');
export const unusedValue = 1;
`,
		'Page.tsrx': `import { Panel as Left } from './left/Panel.tsrx';
import { Panel as Right } from './right/Panel.tsrx';

export function Page(props: { suffix: string }) @{
	<main><Left suffix={props.suffix} /><Right suffix={props.suffix} /></main>
}
`,
	};
}

function positionAt(code: string, offset: number) {
	const lines = code.slice(0, offset).split('\n');
	return { line: lines.length - 1, column: lines[lines.length - 1].length };
}

function expectMappedThrow(
	chunk: { code: string; map: any },
	bundleFile: string,
	authored: Record<string, string>,
	file: string,
	message: string,
	fail: () => never,
) {
	let failure: Error | undefined;
	try {
		fail();
	} catch (error) {
		failure = error as Error;
	}
	expect(failure?.message).toBe(message);
	// Use the thrown production artifact's location, without a Function wrapper
	// or a second compilation step changing its generated line/column.
	const frame = failure!.stack!.split('\n').find((line) => line.includes(`${bundleFile}:`));
	expect(frame, failure!.stack).toBeDefined();
	const location = /:(\d+):(\d+)\)?$/.exec(frame!)!;
	expect(location).not.toBeNull();
	const line = Number(location[1]) - 1;
	const column = Number(location[2]) - 1;
	const segment = decodeMappings(chunk.map.mappings)
		[line].filter(([generatedColumn]) => generatedColumn <= column)
		.at(-1)!;
	expect(segment.length).toBeGreaterThanOrEqual(4);
	const sourceName: string = chunk.map.sources[segment[1]];
	expect(sourceName.replaceAll('\\', '/')).toMatch(
		new RegExp(`(?:^|/)${file.replaceAll('.', '\\.')}$`),
	);
	const original = positionAt(authored[file], authored[file].indexOf('new Error('));
	expect({ line: segment[2], column: segment[3] }).toEqual(original);
	expect(chunk.map.sourcesContent[segment[1]]).toBe(authored[file]);
}

describe('TypeScript output through production Vite builds', () => {
	for (const mode of ['client', 'server'] as const) {
		it(`executes ${mode} output and maps distinct source files after an edited rebuild`, async () => {
			const directory = mkdtempSync(join(tmpdir(), 'octane-vite-typescript-'));
			const write = (file: string, source: string) => {
				const path = join(directory, file);
				mkdirSync(dirname(path), { recursive: true });
				writeFileSync(path, source);
			};
			write('package.json', JSON.stringify({ type: 'module', dependencies: { octane: '*' } }));
			mkdirSync(join(directory, 'node_modules'));
			symlinkSync(PACKAGE_ROOT, join(directory, 'node_modules/octane'), 'dir');
			const entry = join(directory, 'entry.ts');
			write(
				'entry.ts',
				`import { Page } from './Page.tsrx';
export { fail as failLeft } from './left/Panel.tsrx';
export { fail as failRight } from './right/Panel.tsrx';
export { failHelper } from './helper.ts';
export { registrations } from './registry.ts';
${
	mode === 'client'
		? `import { createRoot, flushSync } from 'octane';
export function mount(container: HTMLElement, suffix: string) {
	const root = createRoot(container);
	flushSync(() => root.render(Page, { suffix }));
	return {
		click: (button: HTMLButtonElement) => flushSync(() => button.click()),
		unmount: () => root.unmount(),
	};
}`
		: `import { renderToStaticMarkup } from 'octane/server';
export function render(suffix: string) {
	return renderToStaticMarkup(Page, { suffix }).html;
}`
}
`,
			);
			const plugin = octane({ output: 'ts', hmr: false });
			try {
				for (const revision of [0, 1]) {
					const authored = sources(revision);
					for (const [file, source] of Object.entries(authored)) write(file, source);
					const result = await build({
						root: directory,
						configFile: false,
						logLevel: 'silent',
						define: {
							'process.env.NODE_ENV': '"production"',
							__OCTANE_PROFILE_ENABLED__: 'false',
						},
						plugins: [plugin],
						oxc: { typescript: { onlyRemoveTypeImports: true } },
						ssr: { noExternal: true },
						build: {
							write: false,
							minify: false,
							sourcemap: true,
							...(mode === 'client'
								? { lib: { entry, formats: ['iife' as const], name: 'TypeScriptBuild' } }
								: { ssr: entry, rolldownOptions: { output: { format: 'cjs' as const } } }),
						},
					});
					if (Array.isArray(result)) expect(result).toHaveLength(1);
					const bundle = Array.isArray(result) ? result[0] : result;
					if (!('output' in bundle)) {
						throw new Error('Expected one completed production bundle');
					}
					const chunk = bundle.output.find((item) => item.type === 'chunk' && item.isEntry);
					expect(chunk?.type).toBe('chunk');
					if (chunk?.type !== 'chunk') throw new Error('Missing entry chunk');
					expect(chunk.map).not.toBeNull();
					const bundleFile = join(directory, `${mode}-${revision}`, chunk.fileName);
					const globals = Object.create(globalThis);
					globals.exports = {};
					globals.module = { exports: globals.exports };
					new Script(chunk.code, { filename: bundleFile }).runInNewContext(globals);
					const app: Fixture = mode === 'client' ? globals.TypeScriptBuild : globals.module.exports;
					// The otherwise-unused value import must retain its module's side
					// effect under the consumer's resolved TypeScript transform options.
					expect(app.registrations).toEqual(['loaded']);
					const container = document.createElement('div');
					document.body.append(container);
					const mounted = mode === 'client' ? app.mount(container, 'ready') : null;
					try {
						if (mode === 'server') container.innerHTML = app.render('ready');
						const left = container.querySelector<HTMLButtonElement>('[data-side="left"]')!;
						const right = container.querySelector<HTMLButtonElement>('[data-side="right"]')!;
						expect(left.textContent).toBe(`left-${revision}:ready:1`);
						expect(right.textContent).toBe(`right-${revision}:ready:1`);
						if (mounted !== null) {
							mounted.click(left);
							expect(left.textContent).toBe(`left-${revision}:ready:2`);
							expect(right.textContent).toBe(`right-${revision}:ready:1`);
						}
						for (const [file, name, fail] of [
							['left/Panel.tsrx', 'left', app.failLeft],
							['right/Panel.tsrx', 'right', app.failRight],
							['helper.ts', 'helper', app.failHelper],
						] as const) {
							expectMappedThrow(
								chunk,
								bundleFile,
								authored,
								file,
								`${name} failure ${revision}`,
								fail,
							);
						}
					} finally {
						mounted?.unmount();
						container.remove();
					}
				}
			} finally {
				rmSync(directory, { recursive: true, force: true });
			}
		}, 60_000);
	}
});
