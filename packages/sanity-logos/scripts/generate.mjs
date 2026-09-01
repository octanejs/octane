import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { format } from 'prettier';
import { GroqLogo, GroqMonogram, SanityLogo, SanityMonogram } from '@sanity/logos';

const expectedVersion = '2.2.5';
const check = process.argv.includes('--check');
const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const upstreamManifest = JSON.parse(
	readFileSync(require.resolve('@sanity/logos/package.json'), 'utf8'),
);
if (upstreamManifest.version !== expectedVersion) {
	throw new Error(`Expected @sanity/logos@${expectedVersion}, found ${upstreamManifest.version}`);
}

function decodeAttribute(value) {
	return value
		.replaceAll('&quot;', '"')
		.replaceAll('&#x27;', "'")
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&amp;', '&');
}

function renderLogo(component, props = {}) {
	const markup = renderToStaticMarkup(createElement(component, props));
	const match = markup.match(/^<svg\s+([^>]*)>([\s\S]*)<\/svg>$/);
	if (!match) throw new Error('Could not parse logo SVG markup');
	const attributes = {};
	for (const attribute of match[1].matchAll(/([^\s=]+)="([^"]*)"/g)) {
		attributes[attribute[1]] = decodeAttribute(attribute[2]);
	}
	return { attributes, body: match[2] };
}

const data = {
	groqLogo: renderLogo(GroqLogo),
	groqMonogram: renderLogo(GroqMonogram),
	sanityLogoDefault: renderLogo(SanityLogo),
	sanityLogoDark: renderLogo(SanityLogo, { dark: true }),
	sanityMonogramDefault: renderLogo(SanityMonogram),
	sanityMonogramLight: renderLogo(SanityMonogram, { scheme: 'light' }),
	sanityMonogramDark: renderLogo(SanityMonogram, { scheme: 'dark' }),
	sanityMonogramCustom: renderLogo(SanityMonogram, {
		color: {
			bg1: '__OCTANE_SANITY_BG__',
			bg2: '__OCTANE_SANITY_UNUSED__',
			fg: '__OCTANE_SANITY_FG__',
		},
	}),
};

const source = await format(
	`/* THIS FILE IS AUTO-GENERATED – DO NOT EDIT */\n` +
		Object.entries(data)
			.map(([name, value]) => `export const ${name} = ${JSON.stringify(value)} as const`)
			.join('\n\n'),
	{
		parser: 'typescript',
		useTabs: true,
		tabWidth: 2,
		singleQuote: true,
		trailingComma: 'all',
		printWidth: 100,
	},
);
const target = join(packageDirectory, 'src/data.ts');
if (check) {
	if (readFileSync(target, 'utf8') !== source) throw new Error('src/data.ts is stale');
} else {
	writeFileSync(target, source);
}
console.log(`${check ? 'Verified' : 'Generated'} Sanity logo SVG data.`);
