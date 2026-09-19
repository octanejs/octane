// @vitest-environment node

import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { octane } from 'octane/compiler/vite';
import { build } from 'vite';
import { expect, it } from 'vitest';

it('preserves public hooks and core singleton identities in a production consumer bundle', async () => {
	const result = await build({
		configFile: false,
		root: resolve(import.meta.dirname, '../../..'),
		logLevel: 'error',
		plugins: [octane({ hmr: false })],
		define: {
			__OCTANE_PROFILE_ENABLED__: 'false',
			'process.env.NODE_ENV': JSON.stringify('production'),
		},
		build: {
			write: false,
			minify: false,
			target: 'esnext',
			lib: {
				entry: resolve(import.meta.dirname, '_fixtures/package-consumer.ts'),
				formats: ['iife'],
				name: 'InertiaConsumer',
			},
		},
	});
	const chunks = (Array.isArray(result) ? result : [result]).flatMap((bundle) => {
		if (!('output' in bundle)) throw new Error('Expected a library bundle.');
		return bundle.output.filter((output) => output.type === 'chunk');
	});
	expect(chunks).toHaveLength(1);
	expect(chunks[0].imports).toEqual([]);
	expect(chunks[0].dynamicImports).toEqual([]);
	const context: { InertiaConsumer?: { run: () => unknown } } = {};
	runInNewContext(chunks[0].code, context);
	expect(JSON.parse(JSON.stringify(context.InertiaConsumer!.run()))).toEqual({
		exports: [
			'config',
			'http',
			'progress',
			'resetLayoutProps',
			'router',
			'setLayoutProps',
			'useForm',
			'useHttp',
			'usePage',
			'usePoll',
			'usePrefetch',
			'useRemember',
		],
		http: true,
		progress: true,
		router: true,
	});
}, 60_000);
