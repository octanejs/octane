import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { build, type Plugin } from 'vite';
import { octane } from 'octane/compiler/vite';
import { evaluateCompiledFixtureCode } from './_server-fixture.js';

// A real `vite build` never TS-transforms `.tsrx` after Octane, so an exported
// enum, const enum, namespace, or parameter-property class that reached the
// bundler verbatim failed with `[PARSE_ERROR] Unexpected token`.

const APP = resolve(import.meta.dirname, '_fixtures/typescript-runtime-build');
const ENTRY = resolve(APP, 'main.tsrx');

// The entry is served from a string: @tsrx/core's type-check mapping cannot
// read parameter properties yet, so they cannot live in a checked fixture.
const ENTRY_SOURCE = `
import { createRoot, flushSync, useState } from 'octane';
import { Direction, Tone, Units } from './model.tsrx';

class Stepper {
	constructor(private readonly start: number, public step = 1) {}
	at(turns: number) { return this.start + turns * this.step; }
}

function Compass() @{
	const [turns, setTurns] = useState(0);
	const stepper = new Stepper(Direction.Down, Direction.Right);
	<button class={Tone.Loud} onClick={() => setTurns(turns + 1)}>
		{Direction[Direction.Right] + ':' + Units.format(stepper.at(turns))}
	</button>
}

export function mountCompass(container: HTMLElement) {
	const root = createRoot(container);
	flushSync(() => root.render(Compass));
	return {
		click: (target: HTMLElement) => flushSync(() => target.click()),
		unmount: () => root.unmount(),
	};
}
`;

const entry: Plugin = {
	name: 'typescript-runtime-entry',
	enforce: 'pre',
	resolveId: (id) => (id === ENTRY ? ENTRY : null),
	load: (id) => (id === ENTRY ? ENTRY_SOURCE : null),
};

describe('TypeScript runtime declarations in a production vite build', () => {
	it('bundles and runs enums, namespaces, and parameter properties across modules', async () => {
		const result: any = await build({
			root: APP,
			configFile: false,
			logLevel: 'silent',
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			plugins: [entry, octane({ hmr: false })],
			build: {
				write: false,
				minify: false,
				lib: { entry: ENTRY, formats: ['iife'], name: 'TypeScriptRuntime' },
			},
		});
		const output: any[] = Array.isArray(result) ? result[0].output : result.output;
		const chunk = output.find((item) => item.type === 'chunk' && item.isEntry);
		const app = evaluateCompiledFixtureCode<any>(
			`${chunk.code}\nexport const fixture = TypeScriptRuntime;`,
			chunk.fileName,
			'client',
			undefined,
		).fixture;

		const container = document.createElement('div');
		document.body.append(container);
		const compass = app.mountCompass(container);
		try {
			const button = container.querySelector('button')!;
			expect(button.className).toBe('quiet-loud');
			expect(button.textContent).toBe('Right:20px');
			compass.click(button);
			expect(button.textContent).toBe('Right:180px');
		} finally {
			compass.unmount();
			container.remove();
		}
	}, 60_000);
});
