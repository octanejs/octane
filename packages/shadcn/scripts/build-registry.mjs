// Emits the @octane shadcn registry from the package sources, conforming to
// https://ui.shadcn.com/schema/registry-item.json so the UPSTREAM shadcn CLI can install from it.
//
// MULTI-BASE, THE WAY SHADCN ITSELF DOES IT. shadcn does not namespace its primitive bases; it
// folds base and visual style into the single `style` field of components.json and puts that in
// the registry URL. Its own built-in registry is literally `<host>/styles/{style}/{name}.json`,
// and `{style}`/`{name}` are the only two placeholders the CLI substitutes — verified in
// shadcn@4.14.1's bundle. The CLI never parses or validates the style string, so a composite like
// `radix-nova` is opaque to it and resolved entirely by the registry server.
//
// This emits the same shape:
//
//   registry/styles/<style>/<name>.json   one tree per base
//   registry/<name>.json                  the DEFAULT style, for a URL with no {style} segment
//   registry/registry.json                the index
//
// so a consumer configures ONE registry and picks a base with `style`:
//
//   "registries": { "@octane": "<host>/r/styles/{style}/{name}.json" }
//   "style": "base-nova"        // or radix-nova, aria-nova
//
// The base-agnostic items (utils, types, theme, hooks) are emitted into EVERY style tree. They
// have to be: `registryDependencies: ["@octane/utils"]` resolves through the same templated URL,
// so it would 404 under any style that omitted them.
//
// Bases legitimately differ in which families they ship (radix 44, react-aria 33, base-ui 21) —
// upstream is the same, which is why its CLI carries notes like "only available for Base UI
// projects". A style tree therefore contains exactly the families that base has.
//
// The registry is generated output: edit the sources and re-run, never hand-edit registry/.
//
// Usage: node scripts/build-registry.mjs [--check]
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// `style` is the consumer-facing name that lands in components.json and the URL; `dir` is the
// source tree. The style names keep upstream's <base>-<visual> composite and its short base
// spellings (`aria`, not `react-aria`), matching the `radix-nova` this repo's playground already
// uses and the `aria-nova` the React Aria base was transcribed from.
const BASES = [
	{ style: 'base-nova', dir: 'base-ui' },
	{ style: 'radix-nova', dir: 'radix' },
	{ style: 'aria-nova', dir: 'react-aria' },
];

// Served at the un-styled path for a consumer whose registry URL has no {style} segment.
const DEFAULT_STYLE = 'base-nova';

const OUT_DIR = join(PKG_ROOT, 'registry');
const SCHEMA = 'https://ui.shadcn.com/schema/registry-item.json';

const pkg = JSON.parse(await readFile(join(PKG_ROOT, 'package.json'), 'utf8'));

// Installable dependency spec per import, derived from package.json so a new
// import can never silently ship without its dependency: @octanejs/* siblings
// pinned to the exact tested version (maintainer pinning policy), public npm
// deps by bare name (upstream registry convention). `octane` itself is a peer,
// like react upstream, and is deliberately not emitted.
async function installableDependencySpec(name, version) {
	if (!name.startsWith('@octanejs/')) return name;
	if (!version.startsWith('workspace:')) return `${name}@${version}`;

	const siblingPath = join(PKG_ROOT, '..', name.slice('@octanejs/'.length), 'package.json');
	const sibling = JSON.parse(await readFile(siblingPath, 'utf8'));
	if (sibling.name !== name) {
		throw new Error(`registry: workspace dependency "${name}" resolved to "${sibling.name}"`);
	}
	return `${name}@${sibling.version}`;
}

const DEP_SPECS = Object.fromEntries(
	await Promise.all(
		Object.entries(pkg.dependencies).map(async ([name, version]) => [
			name,
			await installableDependencySpec(name, version),
		]),
	),
);

function toConsumerSource(source) {
	// Emitted file content uses the consumer-alias import shape the shadcn CLI
	// rewrites on install; the package-internal relative layout is ours only.
	// Depth-agnostic: a base's sources sit at src/bases/<base>/ui/, so the hop
	// count up to the shared lib/ and hooks/ is a function of the layout, not of
	// the component. Matching any run of `../` keeps every base emitting the same
	// consumer aliases without the emitter tracking where each base lives.
	return source
		.replaceAll(/'(?:\.\.\/)+lib\/utils'/g, "'@/lib/utils'")
		.replaceAll(/'(?:\.\.\/)+lib\/types'/g, "'@/lib/types'")
		.replaceAll(/'\.\/([\w-]+)\.tsrx'/g, "'@/components/ui/$1'")
		.replaceAll(/'(?:\.\.\/)+hooks\/([\w-]+)'/g, "'@/hooks/$1'");
}

function collectDeps(source) {
	const npm = new Set();
	const registry = new Set();
	for (const match of source.matchAll(/from '([^']+)'/g)) {
		const spec = match[1];
		// A dependency is declared by PACKAGE, but imported by subpath: the radix base reaches for
		// bare `@octanejs/radix` while the base-ui and react-aria bases use deep entry points like
		// `@octanejs/base-ui/accordion` and `@octanejs/aria/components`. Resolve the package root
		// before looking the spec up, or every subpath import reads as undeclared.
		const pkgName = spec.startsWith('@')
			? spec.split('/').slice(0, 2).join('/')
			: spec.split('/')[0];
		if (pkgName in DEP_SPECS) npm.add(DEP_SPECS[pkgName]);
		else if (spec.startsWith('@octanejs/') && spec !== 'octane') {
			// An import the package does not declare cannot be installed by the
			// CLI — fail the build instead of shipping a broken item.
			throw new Error(`registry: undeclared dependency "${spec}" imported by a component`);
		} else if (/^(?:\.\.\/)+lib\/utils$/.test(spec)) registry.add('utils');
		else if (/^(?:\.\.\/)+lib\/types$/.test(spec)) registry.add('types');
		else if (spec.startsWith('./')) registry.add(spec.slice(2).replace(/\.tsrx$/, ''));
		else {
			const hook = /^(?:\.\.\/)+hooks\/([\w-]+)$/.exec(spec);
			if (hook) registry.add(hook[1]);
		}
	}
	return { npm: [...npm].sort(), registry: [...registry].sort() };
}

async function buildItems(srcUi) {
	const items = [];

	const utilsSource = await readFile(join(PKG_ROOT, 'src', 'lib', 'utils.ts'), 'utf8');
	items.push({
		$schema: SCHEMA,
		name: 'utils',
		type: 'registry:lib',
		title: 'Utils',
		description: 'The cn() class utility (clsx + tailwind-merge).',
		dependencies: ['clsx', 'tailwind-merge'],
		files: [
			{ path: 'lib/utils.ts', type: 'registry:lib', target: 'lib/utils.ts', content: utilsSource },
		],
	});

	const typesSource = await readFile(join(PKG_ROOT, 'src', 'lib', 'types.ts'), 'utf8');
	items.push({
		$schema: SCHEMA,
		name: 'types',
		type: 'registry:lib',
		title: 'Types',
		description: 'Host-element prop bases shared by the components.',
		files: [
			{ path: 'lib/types.ts', type: 'registry:lib', target: 'lib/types.ts', content: typesSource },
		],
	});

	const themeSource = await readFile(join(PKG_ROOT, 'src', 'styles', 'theme.css'), 'utf8');
	items.push({
		$schema: SCHEMA,
		name: 'theme',
		type: 'registry:file',
		title: 'Theme tokens',
		description: 'Default neutral shadcn theme tokens (oklch, .dark overrides).',
		files: [
			{
				path: 'styles/theme.css',
				type: 'registry:file',
				target: '~/styles/shadcn-theme.css',
				content: themeSource,
			},
		],
	});

	const hooksDir = join(PKG_ROOT, 'src', 'hooks');
	if (existsSync(hooksDir)) {
		for (const entry of (await readdir(hooksDir)).sort()) {
			if (!entry.endsWith('.ts') || entry.endsWith('.d.ts')) continue;
			const name = entry.replace(/\.ts$/, '');
			const source = await readFile(join(hooksDir, entry), 'utf8');
			items.push({
				$schema: SCHEMA,
				name,
				type: 'registry:hook',
				title: name,
				files: [
					{
						path: `hooks/${entry}`,
						type: 'registry:hook',
						target: `hooks/${entry}`,
						content: toConsumerSource(source),
					},
				],
			});
		}
	}

	for (const entry of (await readdir(srcUi)).sort()) {
		if (!entry.endsWith('.tsrx')) continue;
		const name = entry.replace(/\.tsrx$/, '');
		const source = await readFile(join(srcUi, entry), 'utf8');
		const { npm, registry } = collectDeps(source);
		const item = {
			$schema: SCHEMA,
			name,
			type: 'registry:ui',
			title: name
				.split('-')
				.map((part) => part[0].toUpperCase() + part.slice(1))
				.join(' '),
			files: [
				{
					path: `ui/${entry}`,
					type: 'registry:ui',
					target: `components/ui/${entry}`,
					content: toConsumerSource(source),
				},
			],
		};
		if (npm.length) item.dependencies = npm;
		// Derived from the imports the source actually has — a component that
		// never imports `cn` must not drag lib/utils (and its clsx +
		// tailwind-merge npm deps) into the consumer's project.
		//
		// Namespace-qualified: bare names would resolve against the DEFAULT
		// @shadcn registry, not this one (the namespace protocol's rule for
		// third-party registries).
		if (registry.length) item.registryDependencies = registry.map((dep) => `@octane/${dep}`);
		items.push(item);
	}

	return items;
}

const rendered = new Map();
const styleItemCounts = [];

for (const { style, dir } of BASES) {
	const items = await buildItems(join(PKG_ROOT, 'src', 'bases', dir, 'ui'));
	styleItemCounts.push(`${style}: ${items.length}`);

	for (const item of items) {
		const json = JSON.stringify(item, null, 2) + '\n';
		rendered.set(`styles/${style}/${item.name}.json`, json);
		// The un-styled path mirrors the default style, so a registry URL without a {style}
		// segment still resolves rather than 404ing.
		if (style === DEFAULT_STYLE) rendered.set(`${item.name}.json`, json);
	}

	if (style === DEFAULT_STYLE) {
		rendered.set(
			'registry.json',
			JSON.stringify(
				{
					$schema: 'https://ui.shadcn.com/schema/registry.json',
					name: 'octane',
					homepage: 'https://octanejs.dev',
					items: items.map(({ $schema, files, ...meta }) => ({
						...meta,
						files: files.map(({ content, ...file }) => file),
					})),
				},
				null,
				2,
			) + '\n',
		);
	}
}

// Recursive: the tree is nested now, so a flat readdir would report every styles/ entry as
// orphaned and miss stale files inside it.
async function listFiles(dir, prefix = '') {
	if (!existsSync(dir)) return [];
	const out = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) out.push(...(await listFiles(join(dir, entry.name), rel)));
		else out.push(rel);
	}
	return out;
}

const summary = `${rendered.size} file(s); ${styleItemCounts.join(', ')}`;

if (process.argv.includes('--check')) {
	let stale = false;
	for (const [file, expected] of rendered) {
		const path = join(OUT_DIR, file);
		const actual = existsSync(path) ? await readFile(path, 'utf8') : null;
		if (actual !== expected) {
			console.error(`stale: registry/${file}`);
			stale = true;
		}
	}
	for (const file of await listFiles(OUT_DIR)) {
		if (!rendered.has(file)) {
			console.error(`orphaned: registry/${file}`);
			stale = true;
		}
	}
	if (stale) {
		console.error('registry is stale — run: node scripts/build-registry.mjs');
		process.exit(1);
	}
	console.log(`registry is current (${summary}).`);
} else {
	await rm(OUT_DIR, { recursive: true, force: true });
	for (const [file, content] of rendered) {
		const path = join(OUT_DIR, file);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, content);
	}
	console.log(`wrote registry/ (${summary}).`);
}
