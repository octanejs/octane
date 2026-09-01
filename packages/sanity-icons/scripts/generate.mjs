import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { format } from 'prettier';

const expectedVersion = '5.2.1';
const check = process.argv.includes('--check');
const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDirectory = join(packageDirectory, 'src');
const exportsDirectory = join(sourceDirectory, 'exports');
const require = createRequire(import.meta.url);
const upstreamManifestPath = require.resolve('@sanity/icons/package.json');
const upstreamManifest = JSON.parse(readFileSync(upstreamManifestPath, 'utf8'));

if (upstreamManifest.version !== expectedVersion) {
	throw new Error(`Expected @sanity/icons@${expectedVersion}, found ${upstreamManifest.version}`);
}

const exportNames = Object.keys(upstreamManifest.exports)
	.filter((subpath) => subpath !== '.' && subpath !== './package.json')
	.map((subpath) => subpath.slice(2));

function decodeAttribute(value) {
	return value
		.replaceAll('&quot;', '"')
		.replaceAll('&#x27;', "'")
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&amp;', '&');
}

function parseSvg(markup, exportName) {
	const match = markup.match(/^<svg\s+([^>]*)>([\s\S]*)<\/svg>$/);
	if (!match) throw new Error(`Could not parse ${exportName} SVG markup`);
	const attributes = {};
	for (const attribute of match[1].matchAll(/([^\s=]+)="([^"]*)"/g)) {
		attributes[attribute[1]] = decodeAttribute(attribute[2]);
	}
	return { attributes, body: match[2] };
}

async function renderIcon(exportName) {
	const module = await import(`@sanity/icons/${exportName}`);
	const component = module[`${exportName}Icon`] ?? module.default;
	if (typeof component !== 'object' && typeof component !== 'function') {
		throw new Error(`Missing ${exportName}Icon export`);
	}
	const markup = renderToStaticMarkup(createElement(component));
	return { exportName, ...parseSvg(markup, exportName) };
}

async function formatted(source, parser = 'typescript') {
	return format(source, {
		parser,
		useTabs: true,
		tabWidth: 2,
		singleQuote: true,
		trailingComma: 'all',
		printWidth: 100,
	});
}

function assertOrWrite(path, content) {
	if (check) {
		const current = readFileSync(path, 'utf8');
		if (current !== content) throw new Error(`${path.slice(packageDirectory.length + 1)} is stale`);
		return;
	}
	writeFileSync(path, content);
}

mkdirSync(exportsDirectory, { recursive: true });
const icons = [];
for (const exportName of exportNames) icons.push(await renderIcon(exportName));

for (const icon of icons) {
	const source = await formatted(`
    /* THIS FILE IS AUTO-GENERATED – DO NOT EDIT */
    import {createSanityIcon} from '../createSanityIcon'
    export const ${icon.exportName}Icon = createSanityIcon(
      ${JSON.stringify(`${icon.exportName}Icon`)},
      ${JSON.stringify(icon.attributes)},
      ${JSON.stringify(icon.body)},
    )
    export default ${icon.exportName}Icon
  `);
	assertOrWrite(join(exportsDirectory, `${icon.exportName}.ts`), source);
}

if (!check) {
	const expectedFiles = new Set(icons.map((icon) => `${icon.exportName}.ts`));
	for (const file of readdirSync(exportsDirectory)) {
		if (!expectedFiles.has(file)) throw new Error(`Unexpected generated icon file: ${file}`);
	}
}

const iconType = icons
	.map((icon) => JSON.stringify(icon.attributes['data-sanity-icon']))
	.join(' | ');
const iconMapType = icons
	.map((icon) => `  ${JSON.stringify(icon.attributes['data-sanity-icon'])}: IconComponent`)
	.join('\n');
const iconMap = icons
	.map(
		(icon) =>
			`  ${JSON.stringify(icon.attributes['data-sanity-icon'])}: lazy(() => import('./exports/${icon.exportName}')) as IconComponent`,
	)
	.join(',\n');
const iconsSource = await formatted(`
  /* THIS FILE IS AUTO-GENERATED – DO NOT EDIT */
  import {lazy} from 'octane'
  import type {IconComponent} from './types'
  export type IconSymbol = ${iconType}
  export interface IconMap {
  ${iconMapType}
  }
  export const icons: IconMap = {
  ${iconMap}
  }
`);
assertOrWrite(join(sourceDirectory, 'icons.ts'), iconsSource);

const deprecations = await formatted(
	`/* THIS FILE IS AUTO-GENERATED – DO NOT EDIT */\n` +
		icons
			.map(
				(icon) =>
					`/** @deprecated Import from @octanejs/sanity-icons/${icon.exportName}. */\nexport declare const ${icon.exportName}Icon: never`,
			)
			.join('\n\n'),
);
assertOrWrite(join(sourceDirectory, 'deprecations.ts'), deprecations);

const manifestPath = join(packageDirectory, 'package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.exports = { '.': './src/index.ts' };
for (const icon of icons)
	manifest.exports[`./${icon.exportName}`] = `./src/exports/${icon.exportName}.ts`;
manifest.exports['./package.json'] = './package.json';
const manifestSource = `${JSON.stringify(manifest, null, 2)}\n`;
assertOrWrite(manifestPath, manifestSource);

console.log(`${check ? 'Verified' : 'Generated'} ${icons.length} Sanity icon subpaths.`);
