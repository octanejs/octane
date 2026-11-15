// @vitest-environment node

import { resolve } from 'node:path';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { compile } from 'octane/compiler';

it('keeps optional element descriptor capabilities out of a text-only OctaneCompat bundle', async () => {
	const { code, diagnostics } = compile(
		`"use strong";
		export function Label(props: { label: string }) @{ <>{props.label as string}</> }`,
		resolve(import.meta.dirname, 'octane-compat-bundle.tsrx'),
		{ mode: 'client', dev: false, hmr: false },
	);
	expect(diagnostics).toEqual([]);
	const { outputFiles } = await build({
		stdin: {
			contents: `${code}
				import { createElement } from 'react';
				import { OctaneCompatInline } from 'octane/react';
				export function view(label) {
					return createElement(OctaneCompatInline, { component: Label, props: { label } });
				}`,
			resolveDir: resolve(import.meta.dirname, '..'),
		},
		bundle: true,
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		external: ['react', 'react-dom'],
		format: 'esm',
		minifySyntax: true,
		minifyWhitespace: true,
		target: 'esnext',
		write: false,
	});

	// Keep declaration names so the test can check reachability after tree shaking.
	expect(outputFiles[0].text).not.toMatch(
		/function (?:hostElementBody|setFormAction|fragmentRefDescriptor)\(/,
	);
});
