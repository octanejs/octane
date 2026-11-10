// Bundle the TypeScript harness and its worker, so Node runs plain ESM with octane/data inlined.
import { build } from 'esbuild';

await build({
	entryPoints: { run: 'src/run.ts', worker: 'src/normalized/worker.ts' },
	outdir: 'dist',
	bundle: true,
	format: 'esm',
	platform: 'node',
	target: 'node22',
	logLevel: 'warning',
});
