import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { Browser, Page } from 'playwright';
import type { DOMStage } from '../../../src/dom-stage.js';

declare global {
	interface Window {
		OctaneStage: { DOMStage: typeof DOMStage };
	}
}

export const packageRoot = fileURLToPath(new URL('../../../', import.meta.url));

/** The adapter contract complements the public renderer cases; no mock DOM. */
export async function openStagePage(
	browser: Browser,
	selectedPackage = packageRoot,
): Promise<Page> {
	const result = await build({
		entryPoints: [path.join(selectedPackage, 'src/dom-stage.ts')],
		bundle: true,
		write: false,
		format: 'iife',
		globalName: 'OctaneStage',
		target: 'esnext',
	});
	const page = await browser.newPage();
	try {
		await page.addScriptTag({ content: result.outputFiles[0]!.text });
		return page;
	} catch (error) {
		await page.close();
		throw error;
	}
}
