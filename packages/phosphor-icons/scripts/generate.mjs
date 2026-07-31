import { createRequire } from 'node:module';
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { icons } from '@phosphor-icons/core';

const require = createRequire(import.meta.url);
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_ROOT = join(PACKAGE_ROOT, 'src');
const ICONS_OUT = join(SRC_ROOT, 'icons');
const CHECK = process.argv.includes('--check');
const CORE_VERSION = '2.1.1';
const REACT_VERSION = '2.1.10';
const WEIGHTS = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'];

const coreRoot = resolve(dirname(require.resolve('@phosphor-icons/core')), '..');
const coreManifestPath = join(coreRoot, 'package.json');
const coreManifest = JSON.parse(readFileSync(coreManifestPath, 'utf8'));
const reactRoot = resolve(dirname(require.resolve('@phosphor-icons/react')), '..');
const reactManifestPath = join(reactRoot, 'package.json');
const reactManifest = JSON.parse(readFileSync(reactManifestPath, 'utf8'));

if (coreManifest.version !== CORE_VERSION || reactManifest.version !== REACT_VERSION) {
	throw new Error(
		`Phosphor generator expects @phosphor-icons/core ${CORE_VERSION} and ` +
			`@phosphor-icons/react ${REACT_VERSION}; found ${coreManifest.version} and ` +
			`${reactManifest.version}. Review upstream changes before updating the pins.`,
	);
}
if (icons.length < 1_500) throw new Error(`Parsed only ${icons.length} Phosphor icons`);

const header =
	`// Generated from @phosphor-icons/core@${CORE_VERSION} metadata and SVG assets.\n` +
	'// Run `pnpm phosphor-icons:generate`; do not edit by hand.\n\n';
const expected = new Map();

function parsePaths(source, label) {
	const paths = [];
	for (const match of source.matchAll(/<path\b([^>]*)\/>/g)) {
		const attributes = {};
		for (const attribute of match[1].matchAll(/([A-Za-z_:][-A-Za-z0-9_:.]*)="([^"]*)"/g)) {
			attributes[attribute[1]] = attribute[2]
				.replaceAll('&quot;', '"')
				.replaceAll('&amp;', '&')
				.replaceAll('&lt;', '<')
				.replaceAll('&gt;', '>');
		}
		paths.push(['path', attributes]);
	}
	if (!paths.length) throw new Error(`No paths parsed from ${label}`);
	return paths;
}

for (const icon of icons) {
	const weightEntries = WEIGHTS.map((weight) => {
		const suffix = weight === 'regular' ? '' : `-${weight}`;
		const path = join(coreRoot, 'assets', weight, `${icon.name}${suffix}.svg`);
		if (!existsSync(path)) throw new Error(`Missing canonical asset ${relative(coreRoot, path)}`);
		return `\t${weight}: ${JSON.stringify(parsePaths(readFileSync(path, 'utf8'), path))},`;
	}).join('\n');
	const aliasExports = icon.alias
		? `\nexport { Component as ${icon.alias.pascal_name}Icon };\n`
		: '';
	const source =
		header +
		`import createIcon from '../createIcon';\n` +
		`import type { IconWeights } from '../types';\n\n` +
		`const weights = {\n${weightEntries}\n} as const satisfies IconWeights;\n\n` +
		`const Component = createIcon('${icon.pascal_name}', weights);\n\n` +
		`export { Component as ${icon.pascal_name}, Component as ${icon.pascal_name}Icon };\n` +
		aliasExports +
		`export { weights as __iconWeights };\n` +
		`export default Component;\n`;
	expected.set(
		join(ICONS_OUT, `${icon.name}.ts`),
		await format(source, {
			parser: 'typescript',
			useTabs: true,
			singleQuote: true,
			printWidth: 100,
		}),
	);
}

const exports = [];
for (const icon of icons) {
	const names = [icon.pascal_name, `${icon.pascal_name}Icon`];
	if (icon.alias) names.push(`${icon.alias.pascal_name}Icon`);
	exports.push(`export { ${names.join(', ')} } from './${icon.name}';`);
}
expected.set(
	join(ICONS_OUT, 'index.ts'),
	await format(header + exports.join('\n') + '\n', {
		parser: 'typescript',
		useTabs: true,
		singleQuote: true,
		printWidth: 100,
	}),
);

function walk(directory) {
	if (!existsSync(directory)) return [];
	const files = [];
	for (const name of readdirSync(directory)) {
		const path = join(directory, name);
		if (statSync(path).isDirectory()) files.push(...walk(path));
		else files.push(path);
	}
	return files;
}

if (CHECK) {
	const problems = [];
	for (const [path, contents] of expected) {
		if (!existsSync(path)) problems.push(`missing ${relative(PACKAGE_ROOT, path)}`);
		else if (readFileSync(path, 'utf8') !== contents)
			problems.push(`stale ${relative(PACKAGE_ROOT, path)}`);
	}
	for (const path of walk(ICONS_OUT)) {
		if (!expected.has(path)) problems.push(`unexpected ${relative(PACKAGE_ROOT, path)}`);
	}
	if (problems.length) {
		console.error(`Phosphor generated sources are not current:\n- ${problems.join('\n- ')}`);
		process.exit(1);
	}
	console.log(`Phosphor generated sources are current (${icons.length} icons, six weights each).`);
} else {
	rmSync(ICONS_OUT, { recursive: true, force: true });
	mkdirSync(ICONS_OUT, { recursive: true });
	for (const [path, contents] of expected) {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, contents);
	}
	console.log(`Generated ${icons.length} Phosphor icons with six weights each.`);
}
