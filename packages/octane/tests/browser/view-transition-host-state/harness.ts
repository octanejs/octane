import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { realpathSync } from 'node:fs';
import assert from 'node:assert/strict';
import type { Browser, Page } from 'playwright';

declare global {
	interface Window {
		OctaneHost: typeof import('../../../src/index.js');
	}
}

export const packageRoot = fileURLToPath(new URL('../../../', import.meta.url));

export async function openHostStatePage(
	browser: Browser,
	selectedPackage = packageRoot,
): Promise<Page> {
	const result = await build({
		stdin: {
			contents: 'export * from "./src/index.ts";',
			resolveDir: selectedPackage,
		},
		metafile: true,
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		bundle: true,
		write: false,
		format: 'iife',
		globalName: 'OctaneHost',
		target: 'esnext',
	});
	for (const input of Object.keys(result.metafile!.inputs)) {
		if (input.startsWith('<')) continue;
		const actual = realpathSync(path.resolve(input));
		if (actual.includes('/packages/octane/src/'))
			assert(actual.startsWith(realpathSync(selectedPackage) + '/src/'), actual);
	}
	const page = await browser.newPage();
	try {
		await page.addScriptTag({ content: result.outputFiles[0]!.text });
		return page;
	} catch (error) {
		await page.close();
		throw error;
	}
}
