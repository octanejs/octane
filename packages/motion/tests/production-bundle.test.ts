// @vitest-environment node

import { createRequire } from 'node:module';
import { resolve, sep } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

interface BrowserRealm {
	window: Window & {
		eval(source: string): unknown;
		close(): void;
	};
}

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
	JSDOM: new (
		markup: string,
		options: { runScripts: 'dangerously'; pretendToBeVisual: boolean },
	) => BrowserRealm;
};
const packageDirectory = resolve(import.meta.dirname, '..');

describe('@octanejs/motion public production imports', () => {
	it('runs the selected animation without retaining unused Octane motion bindings', async () => {
		const result = await build({
			stdin: {
				contents: `
import { animate } from '@octanejs/motion';

const element = document.getElementById('animated');
const controls = animate(element, { opacity: 0.25 }, {
	duration: 0,
});
globalThis.animationCompleted = new Promise((resolve) => {
	controls.then(() => {
		resolve({
			opacity: element.style.opacity,
			stoppable: typeof controls.stop === 'function',
		});
	});
});
`,
				resolveDir: packageDirectory,
				sourcefile: 'public-motion-consumer.ts',
			},
			bundle: true,
			define: {
				__OCTANE_PROFILE_ENABLED__: 'false',
				'process.env.NODE_ENV': JSON.stringify('production'),
			},
			format: 'iife',
			logLevel: 'silent',
			metafile: true,
			minify: true,
			platform: 'browser',
			treeShaking: true,
			write: false,
		});
		const browser = new JSDOM('<!doctype html><div id="animated"></div>', {
			runScripts: 'dangerously',
			pretendToBeVisual: true,
		});

		try {
			browser.window.eval(result.outputFiles[0].text);

			const snapshot = await (
				browser.window as typeof browser.window & {
					animationCompleted: Promise<{ opacity: string; stoppable: boolean }>;
				}
			).animationCompleted;
			expect(snapshot).toEqual({ opacity: '0.25', stoppable: true });
		} finally {
			browser.window.close();
		}

		const includedModules = Object.entries(Object.values(result.metafile!.outputs)[0].inputs)
			.filter(([, input]) => input.bytesInOutput > 0)
			.map(([module]) => module.split(sep).join('/'));
		const unusedBindings = includedModules.filter((module) =>
			/(?:^|\/)packages\/motion\/src\/(?:context|useSpring)\.ts$/.test(module),
		);

		expect(unusedBindings).toEqual([]);
	});
});
