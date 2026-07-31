// Emits the @octane shadcn registry from the package sources: one
// registry-item JSON per src/ui component (type registry:ui), a `utils`
// registry:lib item for cn(), and a `theme` registry:file item for the token
// CSS — conforming to https://ui.shadcn.com/schema/registry-item.json so the
// UPSTREAM shadcn CLI can install from it via a namespaced registry
// (`"@octane": "<host>/r/{name}.json"`). The registry is generated output:
// edit the sources and re-run, never hand-edit registry/.
//
// Usage: node scripts/build-registry.mjs [--check]
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_UI = join(PKG_ROOT, 'src', 'bases', 'radix', 'ui');
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
		if (spec in DEP_SPECS) npm.add(DEP_SPECS[spec]);
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

async function buildItems() {
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

	for (const entry of (await readdir(SRC_UI)).sort()) {
		if (!entry.endsWith('.tsrx')) continue;
		const name = entry.replace(/\.tsrx$/, '');
		const source = await readFile(join(SRC_UI, entry), 'utf8');
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

const items = await buildItems();
const registryIndex = {
	$schema: 'https://ui.shadcn.com/schema/registry.json',
	name: 'octane',
	homepage: 'https://octanejs.dev',
	items: items.map(({ $schema, files, ...meta }) => ({
		...meta,
		files: files.map(({ content, ...file }) => file),
	})),
};

const rendered = new Map([['registry.json', JSON.stringify(registryIndex, null, 2) + '\n']]);
for (const item of items) rendered.set(`${item.name}.json`, JSON.stringify(item, null, 2) + '\n');

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
	const existing = existsSync(OUT_DIR) ? await readdir(OUT_DIR) : [];
	for (const file of existing) {
		if (!rendered.has(file)) {
			console.error(`orphaned: registry/${file}`);
			stale = true;
		}
	}
	if (stale) {
		console.error('registry is stale — run: node scripts/build-registry.mjs');
		process.exit(1);
	}
	console.log(`registry is current (${items.length} item(s)).`);
} else {
	await rm(OUT_DIR, { recursive: true, force: true });
	await mkdir(OUT_DIR, { recursive: true });
	for (const [file, content] of rendered) await writeFile(join(OUT_DIR, file), content);
	console.log(`wrote registry/ (${items.length} item(s)).`);
}
