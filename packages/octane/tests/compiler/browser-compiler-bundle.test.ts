// @vitest-environment node

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const OCTANE_PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));

describe('octane/compiler browser bundle', () => {
	it('keeps native parsing and optional TypeScript project analysis out of the browser graph', async () => {
		const result = await build({
			absWorkingDir: OCTANE_PACKAGE_ROOT,
			stdin: {
				contents:
					"import { compile } from 'octane/compiler';\n" +
					"compile(`export function App() @{ <p>{'browser compiler'}</p> }`, 'App.tsrx');\n" +
					'compile(`export function Scene() @{ <label value="writer" /> }`, \'Scene.tsrx\', {' +
					"hmr: false, renderer: { id: 'native', module: '@test/valdi-writer', target: 'valdi' } });\n",
				resolveDir: OCTANE_PACKAGE_ROOT,
				sourcefile: 'browser-compiler-entry.js',
			},
			bundle: true,
			conditions: ['browser', 'import', 'module', 'default'],
			format: 'esm',
			logLevel: 'silent',
			metafile: true,
			platform: 'browser',
			target: 'es2022',
			write: false,
		});

		const inputs = Object.keys(result.metafile.inputs).map((input) => input.replaceAll('\\', '/'));
		expect(inputs.some((input) => input.includes('/@tsrx/core/'))).toBe(true);
		expect(inputs.some((input) => input.includes('/oxc-tsrx/'))).toBe(false);
		expect(inputs.some((input) => input.endsWith('/compiler/typescript.js'))).toBe(false);
		expect(inputs.some((input) => input.includes('/node_modules/typescript/'))).toBe(false);
		expect(inputs.some((input) => input.includes('/@volar/'))).toBe(false);
		expect(inputs.some((input) => input.includes('/@tsrx/typescript-plugin/'))).toBe(false);
	});
});
