// @vitest-environment node
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

describe('@octanejs/lucide — tree shaking', () => {
	it('includes only imported icon data in a named-icon bundle', async () => {
		const result = await build({
			stdin: {
				contents: "import { Camera } from './src/index.ts'; export { Camera };",
				resolveDir: new URL('..', import.meta.url).pathname,
				loader: 'ts',
			},
			bundle: true,
			format: 'esm',
			platform: 'browser',
			external: ['octane'],
			metafile: true,
			write: false,
		});
		const output = Object.values(result.metafile.outputs)[0];
		const bytesFor = (suffix: string) =>
			Object.entries(output.inputs).find(([path]) => path.endsWith(suffix))?.[1].bytesInOutput ?? 0;
		expect(bytesFor('/icons/camera.mjs')).toBeGreaterThan(0);
		expect(bytesFor('/icons/circle-alert.mjs')).toBe(0);
	});
});
