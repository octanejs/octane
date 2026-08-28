#!/usr/bin/env node

/**
 * Stages the advanced React Aria 3.50 / React Stately 3.48 / React Aria
 * Components 1.19 modules from the repository's pinned `.react-spectrum`
 * checkout into a staging directory and rewrites only module boundaries.
 * Behavioral adaptations are reviewed into the package source separately.
 *
 * This script is intentionally release-pinned and refuses to overwrite the live
 * package. Updating the pin means reviewing the staged source and export diffs.
 */
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePackageRoot = path.resolve(scriptDirectory, '..');
const repoRoot = path.resolve(sourcePackageRoot, '../..');
const outputFlag = process.argv.indexOf('--output-root');
if (outputFlag === -1 || !process.argv[outputFlag + 1]) {
	throw new Error('Usage: port-advanced-source.mjs --output-root <staging-directory>');
}
const packageRoot = path.resolve(process.cwd(), process.argv[outputFlag + 1]);
if (packageRoot === sourcePackageRoot) {
	throw new Error('Refusing to overwrite packages/aria; choose a staging directory');
}
const upstreamRoot = path.join(repoRoot, '.react-spectrum', 'packages');

const PIN = '1c84a49a1faf50b571c84e00bcf9c60b22ddd03e';
const PRAGMA = '/** @jsxImportSource octane */';

const checkoutCommit = execFileSync(
	'git',
	['-C', path.join(repoRoot, '.react-spectrum'), 'rev-parse', 'HEAD'],
	{ encoding: 'utf8' },
).trim();
if (checkoutCommit !== PIN) {
	throw new Error(`Expected .react-spectrum at ${PIN}, found ${checkoutCommit}`);
}

const statelyAreas = [
	'calendar',
	'color',
	'data',
	'datepicker',
	'dnd',
	'layout',
	'toast',
	'virtualizer',
];
const ariaAreas = ['calendar', 'color', 'datepicker', 'dnd', 'toast', 'virtualizer'];
const ariaFiles = [
	['landmark/useLandmark.ts', 'landmark/useLandmark.tsx'],
	['utils/useLoadMore.ts', 'utils/useLoadMore.tsx'],
];
const componentFiles = [
	'Calendar.tsx',
	'ColorArea.tsx',
	'ColorField.tsx',
	'ColorPicker.tsx',
	'ColorSlider.tsx',
	'ColorSwatch.tsx',
	'ColorSwatchPicker.tsx',
	'ColorThumb.tsx',
	'ColorWheel.tsx',
	'DateField.tsx',
	'DatePicker.tsx',
	'DropZone.tsx',
	'FileTrigger.tsx',
	'GridLayout.ts',
	'HiddenDateInput.tsx',
	'TableLayout.ts',
	'Toast.tsx',
	'Virtualizer.tsx',
	'useDragAndDrop.tsx',
];
const intlAreas = ['calendar', 'color', 'datepicker', 'dnd', 'toast'];

function posix(value) {
	return value.split(path.sep).join('/');
}

function importPath(fromFile, targetFile) {
	let relative = posix(path.relative(path.dirname(fromFile), targetFile)).replace(
		/\.(?:ts|tsx)$/,
		'',
	);
	return relative.startsWith('.') ? relative : `./${relative}`;
}

const exportJobs = new Map();

async function ensurePublishedExport(packageName, subpath) {
	const key = `${packageName}/${subpath}`;
	if (exportJobs.has(key)) {
		return exportJobs.get(key);
	}

	const exportFile = path.join(upstreamRoot, packageName, 'exports', `${subpath}.ts`);
	const destination = path.join(packageRoot, 'src/upstream-exports', packageName, `${subpath}.tsx`);
	const job = (async () => {
		let source;
		try {
			source = await readFile(exportFile, 'utf8');
		} catch (error) {
			if (error?.code === 'ENOENT') {
				throw new Error(`No pinned export map for ${packageName}/${subpath}`, { cause: error });
			}
			throw error;
		}
		await mkdir(path.dirname(destination), { recursive: true });
		await writeFile(
			destination,
			await rewriteSource(source, exportFile, destination, { publishedPackage: packageName }),
		);
		return destination;
	})();
	exportJobs.set(key, job);
	return job;
}

async function rewriteSpecifier(specifier, destination, context = {}) {
	const publishedSource = specifier.match(/^(?:\.\.\/)+src\/(.+)$/);
	if (context.publishedPackage && publishedSource) {
		const localRoot =
			context.publishedPackage === 'react-stately'
				? path.join(packageRoot, 'src/stately')
				: path.join(packageRoot, 'src');
		return importPath(destination, path.join(localRoot, publishedSource[1]));
	}
	if (specifier === 'react') {
		return importPath(destination, path.join(packageRoot, 'src/compat/react.ts'));
	}
	if (specifier === 'react-dom' || specifier === 'use-sync-external-store/shim/index.js') {
		return 'octane';
	}
	if (specifier === '../intl/*.json') {
		return importPath(
			destination,
			path.join(packageRoot, 'src/intl/react-aria-components/index.ts'),
		);
	}
	const areaIntl = specifier.match(/^\.\.\/\.\.\/intl\/([^/]+)\/\*\.json$/);
	if (areaIntl) {
		return importPath(destination, path.join(packageRoot, `src/intl/${areaIntl[1]}/index.ts`));
	}
	if (specifier.startsWith('react-aria/')) {
		return importPath(
			destination,
			await ensurePublishedExport('react-aria', specifier.slice('react-aria/'.length)),
		);
	}
	if (specifier.startsWith('react-stately/')) {
		return importPath(
			destination,
			await ensurePublishedExport('react-stately', specifier.slice('react-stately/'.length)),
		);
	}
	return specifier;
}

async function rewriteSource(source, upstreamFile, destination, context = {}) {
	const specifiers = [...source.matchAll(/from\s+(['"])([^'"]+)\1/g)].map((match) => match[2]);
	const replacements = new Map();
	for (const specifier of specifiers) {
		replacements.set(specifier, await rewriteSpecifier(specifier, destination, context));
	}

	let output = source.replace(/from\s+(['"])([^'"]+)\1/g, (full, quote, specifier) => {
		return `from ${quote}${replacements.get(specifier) ?? specifier}${quote}`;
	});
	output = output
		.replace(/React\.useRef\b/g, 'useRef')
		.replace(/React\.useContext\b/g, 'useContext');
	output = output
		.replace(/\(forwardRef as forwardRefType\)/g, '(forwardRef as any)')
		.replace(/typeof jest !== 'undefined'/g, "typeof (globalThis as any).jest !== 'undefined'");
	if (upstreamFile.endsWith('react-aria-components/src/useDragAndDrop.tsx')) {
		output = output.replace(
			/import \{ListDropTargetDelegate\} from ([^;]+);/,
			`import {ListDropTargetDelegate} from $1;\n\n` +
				`// Compatibility exports consumed by the existing collection component ports.\n` +
				`export type {AriaDropIndicatorProps, DropIndicatorAria, DraggableCollectionState, ` +
				`DraggableItemResult, DroppableCollectionResult, DroppableCollectionState, ` +
				`DroppableItemResult};`,
		);
	}

	const extraHooks = [];
	if (/\buseRef\b/.test(output) && !/import[\s\S]*?\buseRef\b[\s\S]*?from\s+['"]/.test(output)) {
		extraHooks.push('useRef');
	}
	if (
		/\buseContext\b/.test(output) &&
		!/import[\s\S]*?\buseContext\b[\s\S]*?from\s+['"]/.test(output)
	) {
		extraHooks.push('useContext');
	}
	if (extraHooks.length > 0) {
		output = `import {${extraHooks.join(', ')}} from 'octane';\n${output}`;
	}

	const provenance = posix(path.relative(path.join(repoRoot, '.react-spectrum'), upstreamFile));
	return `${PRAGMA}\n// Ported from adobe/react-spectrum@${PIN} (${provenance}).\n${output}`;
}

async function copySourceFile(upstreamFile, destination) {
	await mkdir(path.dirname(destination), { recursive: true });
	const source = await readFile(upstreamFile, 'utf8');
	await writeFile(destination, await rewriteSource(source, upstreamFile, destination));
}

async function copyArea(packageName, area, destinationRoot) {
	const sourceRoot = path.join(upstreamRoot, packageName, 'src', area);
	for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
		if (!entry.isFile() || !/\.(?:ts|tsx)$/.test(entry.name)) continue;
		const destinationName = entry.name.replace(/\.ts$/, '.tsx');
		await copySourceFile(
			path.join(sourceRoot, entry.name),
			path.join(destinationRoot, area, destinationName),
		);
	}
}

function localeIdentifier(locale) {
	return locale.replaceAll('-', '_');
}

async function copyIntlArea(area) {
	const sourceRoot = path.join(upstreamRoot, 'react-aria', 'intl', area);
	const destinationRoot = path.join(packageRoot, 'src/intl', area);
	await mkdir(destinationRoot, { recursive: true });
	const locales = (await readdir(sourceRoot)).filter((file) => file.endsWith('.json')).sort();
	for (const locale of locales) {
		await copyFile(path.join(sourceRoot, locale), path.join(destinationRoot, locale));
	}
	const imports = locales
		.map((file) => `import ${localeIdentifier(file.slice(0, -5))} from './${file}';`)
		.join('\n');
	const values = locales
		.map((file) => `\t'${file.slice(0, -5)}': ${localeIdentifier(file.slice(0, -5))},`)
		.join('\n');
	await writeFile(
		path.join(destinationRoot, 'index.ts'),
		`// Generated from adobe/react-spectrum@${PIN}; JSON files are copied verbatim.\n` +
			`import { compileDictionaries } from '../compileMessages';\n${imports}\n\n` +
			`export default compileDictionaries({\n${values}\n});\n`,
	);
}

async function copyComponentsIntl() {
	const sourceRoot = path.join(upstreamRoot, 'react-aria-components', 'intl');
	const destinationRoot = path.join(packageRoot, 'src/intl/react-aria-components');
	await mkdir(destinationRoot, { recursive: true });
	const locales = (await readdir(sourceRoot)).filter((file) => file.endsWith('.json')).sort();
	for (const locale of locales) {
		await copyFile(path.join(sourceRoot, locale), path.join(destinationRoot, locale));
	}
	const imports = locales
		.map((file) => `import ${localeIdentifier(file.slice(0, -5))} from './${file}';`)
		.join('\n');
	const values = locales
		.map((file) => `\t'${file.slice(0, -5)}': ${localeIdentifier(file.slice(0, -5))},`)
		.join('\n');
	await writeFile(
		path.join(destinationRoot, 'index.ts'),
		`// Generated from adobe/react-spectrum@${PIN}; JSON files are copied verbatim.\n` +
			`import { compileDictionaries } from '../compileMessages';\n${imports}\n\n` +
			`export default compileDictionaries({\n${values}\n});\n`,
	);
}

for (const area of statelyAreas) {
	await copyArea('react-stately', area, path.join(packageRoot, 'src/stately'));
}
for (const area of ariaAreas) {
	await copyArea('react-aria', area, path.join(packageRoot, 'src'));
}
for (const [source, destination] of ariaFiles) {
	await copySourceFile(
		path.join(upstreamRoot, 'react-aria/src', source),
		path.join(packageRoot, 'src', destination),
	);
}
for (const file of componentFiles) {
	await copySourceFile(
		path.join(upstreamRoot, 'react-aria-components/src', file),
		path.join(packageRoot, 'src/components', file.replace(/\.ts$/, '.tsx')),
	);
}
for (const area of intlAreas) {
	await copyIntlArea(area);
}
await copyComponentsIntl();

console.log('Ported pinned advanced React Aria source modules.');
