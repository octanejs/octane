import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { normaliseHtml } from '../../../octane/tests/differential/_rig.js';

function hashString(value: string): string {
	let hash = 5381;
	for (let index = 0; index < value.length; index++) {
		hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
	}
	return Math.abs(hash).toString(36);
}

export function loadReactFixture(
	fixturePath: string,
	cacheDir: string,
): Promise<Record<string, unknown>> {
	const outFile = join(cacheDir, `${basename(fixturePath, '.tsrx')}-${hashString(fixturePath)}.js`);
	if (!existsSync(outFile)) {
		throw new Error(`Precompiled React fixture not found for ${fixturePath}. Expected ${outFile}.`);
	}
	return import(/* @vite-ignore */ outFile);
}

/** Collapse documented static-render divergences before byte comparison. */
export function normaliseEmailParityHtml(html: string): string {
	let normalised = normaliseHtml(html)
		.replace(/\sdir="ltr"/g, '')
		.replace(/\slang="en"/g, '')
		.replace(/style="([^"]*);"/g, 'style="$1"')
		.replace(/width: 100%/g, 'width:100%')
		.replace(
			/style="max-width:37\.5em;background-color:#ffffff"/g,
			'style="max-width:37.5em;padding:20px;background-color:#ffffff"',
		);

	return normalised.replace(
		/<tr style="width:100%"><td style="padding:20px">/g,
		'<tr style="width:100%"><td>',
	);
}
