// @vitest-environment node
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const packageRoot = new URL('..', import.meta.url).pathname;

async function bundle(contents: string) {
	const result = await build({
		stdin: {
			contents,
			resolveDir: packageRoot,
			loader: 'ts',
		},
		bundle: true,
		format: 'esm',
		platform: 'browser',
		external: ['octane'],
		metafile: true,
		write: false,
	});
	return Object.values(result.metafile.outputs)[0];
}

function bytesFor(output: Awaited<ReturnType<typeof bundle>>, suffix: string): number {
	return (
		Object.entries(output.inputs).find(([path]) => path.endsWith(suffix))?.[1].bytesInOutput ?? 0
	);
}

describe('@octanejs/phosphor-icons — tree shaking', () => {
	it('tree-shakes sibling icons from the documented package-root export', async () => {
		const output = await bundle(
			"import { Camera } from '@octanejs/phosphor-icons'; export { Camera };",
		);
		expect(bytesFor(output, '/src/icons/camera.ts')).toBeGreaterThan(0);
		expect(bytesFor(output, '/src/icons/alarm.ts')).toBe(0);
		expect(bytesFor(output, '/src/icons/airplane.ts')).toBe(0);
		expect(Object.keys(output.inputs).some((path) => path.includes('@phosphor-icons/core'))).toBe(
			false,
		);
	});

	it('resolves and bundles the documented per-icon package subpath', async () => {
		const output = await bundle("export { Camera } from '@octanejs/phosphor-icons/icons/camera';");
		expect(bytesFor(output, '/src/icons/camera.ts')).toBeGreaterThan(0);
		expect(bytesFor(output, '/src/icons/alarm.ts')).toBe(0);
		const inputs = Object.keys(output.inputs);
		expect(inputs.some((path) => path.includes('@phosphor-icons/core'))).toBe(false);
	});
});
