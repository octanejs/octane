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

const require = createRequire(import.meta.url);
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_ROOT = join(PACKAGE_ROOT, 'src');
const ICONS_OUT = join(SRC_ROOT, 'icons');
const CHECK = process.argv.includes('--check');
const EXPECTED_VERSION = '1.24.0';

const reactManifestPath = require.resolve('lucide-react/package.json');
const reactRoot = dirname(reactManifestPath);
const reactManifest = JSON.parse(readFileSync(reactManifestPath, 'utf8'));
const iconsEntry = require.resolve('@lucide/icons');
const iconsRoot = resolve(dirname(iconsEntry), '../..');
const iconsManifest = JSON.parse(readFileSync(join(iconsRoot, 'package.json'), 'utf8'));

if (reactManifest.version !== EXPECTED_VERSION || iconsManifest.version !== EXPECTED_VERSION) {
	throw new Error(
		`Lucide generator expects lucide-react and @lucide/icons ${EXPECTED_VERSION}; found ` +
			`${reactManifest.version} and ${iconsManifest.version}. Review upstream changes before updating the pin.`,
	);
}

const reactEsm = join(reactRoot, 'dist/esm');
const reactIcons = join(reactEsm, 'icons');
const canonicalSource = readFileSync(join(reactIcons, 'index.mjs'), 'utf8');
const rootSource = readFileSync(join(reactEsm, 'lucide-react.mjs'), 'utf8');
const dynamicSource = readFileSync(join(reactEsm, 'dynamicIconImports.mjs'), 'utf8');

const canonical = [];
for (const match of canonicalSource.matchAll(
	/^export \{ default as ([A-Za-z0-9_$]+) \} from '\.\/([^']+)\.mjs';$/gm,
)) {
	canonical.push({ name: match[1], path: match[2] });
}

if (canonical.length < 1_000) {
	throw new Error(`Parsed only ${canonical.length} canonical Lucide icons`);
}

const canonicalByPath = new Map(canonical.map((icon) => [icon.path, icon.name]));
const allReactModules = readdirSync(reactIcons)
	.filter((name) => name.endsWith('.mjs') && name !== 'index.mjs')
	.map((name) => name.slice(0, -4))
	.sort();

const expected = new Map();
const generatedHeader =
	'// Generated from lucide-react@1.24.0 and @lucide/icons@1.24.0.\n' +
	'// Run `pnpm lucide:generate`; do not edit by hand.\n\n';

for (const { name, path } of canonical) {
	expected.set(
		join(ICONS_OUT, `${path}.ts`),
		generatedHeader +
			`import iconData from '@lucide/icons/icons/${path}';\n` +
			`import createLucideIcon from '../createLucideIcon';\n` +
			`import type { IconNode } from '../types';\n\n` +
			`const __iconNode = iconData.node as IconNode;\n` +
			`const ${name} = createLucideIcon(iconData.name, __iconNode);\n\n` +
			`export { __iconNode };\n` +
			`export default ${name};\n`,
	);
}

for (const path of allReactModules) {
	if (canonicalByPath.has(path)) continue;
	const source = readFileSync(join(reactIcons, `${path}.mjs`), 'utf8');
	const target = source.match(/export \{ default \} from '\.\/([^']+)\.mjs';/m)?.[1];
	if (!target || !canonicalByPath.has(target)) {
		throw new Error(`Could not resolve Lucide alias module ${path}`);
	}
	expected.set(
		join(ICONS_OUT, `${path}.ts`),
		generatedHeader + `export { default } from './${target}';\n`,
	);
}

const indexText =
	generatedHeader +
	canonical.map(({ name, path }) => `export { default as ${name} } from './${path}';`).join('\n') +
	'\n';
expected.set(join(ICONS_OUT, 'index.ts'), indexText);

const aliasLines = [];
for (const match of rootSource.matchAll(
	/^export \{ ([^}]+) \} from '\.\/icons\/([^']+)\.mjs';$/gm,
)) {
	const path = match[2];
	const canonicalName = canonicalByPath.get(path);
	if (!canonicalName) throw new Error(`Root export points at unknown icon ${path}`);
	const aliases = match[1]
		.split(', ')
		.map((part) => part.match(/^default as ([A-Za-z0-9_$]+)$/)?.[1])
		.filter((name) => name && name !== canonicalName);
	if (aliases.length) {
		aliasLines.push(
			`export { ${aliases.map((name) => `default as ${name}`).join(', ')} } from './icons/${path}';`,
		);
	}
}

expected.set(
	join(SRC_ROOT, 'aliases.ts'),
	generatedHeader +
		(await format(aliasLines.join('\n') + '\n', {
			parser: 'typescript',
			useTabs: true,
			singleQuote: true,
			printWidth: 100,
		})),
);

const dynamicEntries = [];
for (const match of dynamicSource.matchAll(
	/^\s*"([^"]+)": \(\) => import\('\.\/icons\/([^']+)\.mjs'\),?$/gm,
)) {
	dynamicEntries.push({ name: match[1], path: match[2] });
}
if (dynamicEntries.length < canonical.length) {
	throw new Error(`Parsed only ${dynamicEntries.length} dynamic Lucide icon names`);
}

const dynamicText =
	generatedHeader +
	(await format(
		'const dynamicIconImports = {\n' +
			dynamicEntries
				.map(({ name, path }) => `\t'${name}': () => import('./icons/${path}'),`)
				.join('\n') +
			'\n} as const;\n\n' +
			'export type IconName = keyof typeof dynamicIconImports;\n' +
			'export default dynamicIconImports;\n',
		{
			parser: 'typescript',
			useTabs: true,
			singleQuote: true,
			printWidth: 100,
		},
	));
expected.set(join(SRC_ROOT, 'dynamicIconImports.ts'), dynamicText);

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
		console.error(`Lucide generated sources are not current:\n- ${problems.join('\n- ')}`);
		process.exit(1);
	}
	console.log(
		`Lucide generated sources are current (${canonical.length} icons, ` +
			`${dynamicEntries.length} dynamic names).`,
	);
} else {
	rmSync(ICONS_OUT, { recursive: true, force: true });
	mkdirSync(ICONS_OUT, { recursive: true });
	for (const [path, contents] of expected) {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, contents);
	}
	console.log(
		`Generated ${canonical.length} Lucide icons, ${allReactModules.length - canonical.length} ` +
			`deep aliases, and ${dynamicEntries.length} dynamic names.`,
	);
}
