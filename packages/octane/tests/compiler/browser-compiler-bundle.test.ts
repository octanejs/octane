// @vitest-environment node

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const OCTANE_PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));

describe('octane/compiler browser bundle', () => {
	it('uses the pure-JavaScript parser instead of the Node-native parser', async () => {
		const result = await build({
			absWorkingDir: OCTANE_PACKAGE_ROOT,
			stdin: {
				contents:
					"import { compile } from 'octane/compiler';\n" +
					"compile(`export function App() @{ <p>{'browser compiler'}</p> }`, 'App.tsrx');\n",
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
	});
});
