/**
 * Renders one OG image per library to `.og-preview/`.
 * Run with: pnpm exec tsx scripts/og-preview.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { libraries } from '../src/libraries/libraries';
import { generateOgImageResponse } from '../src/server/og/generate.server';

const OUT_DIR = resolve(process.cwd(), '.og-preview');

async function renderToFile(outPath: string, input: Parameters<typeof generateOgImageResponse>[0]) {
	const result = await generateOgImageResponse(input);
	if ('kind' in result) {
		console.warn(`[skip] ${input.libraryId}: ${result.kind}`);
		return;
	}
	const buf = Buffer.from(await result.arrayBuffer());
	writeFileSync(outPath, buf);
	console.log(`[ok] ${outPath}`);
}

async function main() {
	mkdirSync(OUT_DIR, { recursive: true });

	for (const lib of libraries) {
		if (!lib.to) continue; // skip entries without a landing page (react-charts, create-tsrouter-app)

		await renderToFile(resolve(OUT_DIR, `${lib.id}.png`), { libraryId: lib.id });
		await renderToFile(resolve(OUT_DIR, `${lib.id}-docs.png`), {
			libraryId: lib.id,
			title: 'Overview',
			description: `${lib.tagline} Guides, API reference and examples in one place.`,
		});
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
