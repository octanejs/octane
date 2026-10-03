// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { compile } from '../src/compiler/compile.js';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import { createWriterRecorder } from './_valdi-writer.js';

const renderer = {
	id: 'native',
	module: '@test/valdi-writer',
	target: 'valdi',
	server: 'unsupported',
	text: 'reject',
} as const;

describe('Valdi ABI 1 lazy ref boundary', () => {
	it.each([
		['named import', "import { useLazyRef } from 'octane';", 'useLazyRef(() => 1)'],
		['aliased import', "import { useLazyRef as ref } from 'octane';", 'ref(() => 1)'],
	])('rejects an unsupported %s', (_, imports, call) => {
		const source = `${imports} export function Scene() @{ const value = ${call}; <view /> }`;
		expect(() => compile(source, '/src/Scene.tsrx', { renderer })).toThrow(
			/runtime import "useLazyRef" has no Valdi writer implementation/,
		);
	});

	it('rejects namespace imports', () => {
		const source = `import * as Octane from 'octane';
			export function Scene() @{ const value = Octane.useLazyRef(() => 1); <view /> }`;
		expect(() => compile(source, '/src/Scene.tsrx', { renderer })).toThrow(
			/Valdi modules require named imports from octane/,
		);
	});

	it('preserves an ordinary explicit object slot and stored function', () => {
		const source = `import { useRef } from 'octane';
			export function Scene(props) @{
				const ref = useRef(props.callback, props.slot);
				<view value={ref.current} />
			}`;
		const recorder = createWriterRecorder();
		const module = loadCompiledFixtureSource(source, {
			id: '/src/Scene.tsrx',
			mode: 'client',
			compileOptions: { renderer, hmr: false },
			runtimeModules: { [renderer.module]: recorder.adapter },
		});
		const callback = vi.fn();
		const slot = { lazy: true };
		const [node] = recorder.render(module.Scene, { callback, slot });
		expect(node.props.value).toBe(callback);
		expect(callback).not.toHaveBeenCalled();
	});
});
