// Build the repository's Lynx examples and publish them as static example data
// the site's <Go> component can mount.
//
// The layout under public/lynx-examples/<id>/ is the one @lynx-js/go-web
// defines, so the same packaged example works in this site's own <Go> and in
// the community gallery at go.lynxjs.org:
//
//   example-metadata.json   name, source file list, templateFiles[] entries
//   dist/<entry>.lynx.bundle  the native bundle Lynx Explorer loads over QR
//   dist/<entry>.web.bundle   the Lynx-for-Web bundle <lynx-view> mounts
//   <source files>            copied verbatim, so a reader can fetch any of them
//
// example-source.json is this site's own addition beside that contract: the
// sources highlighted ahead of time through the docs' Shiki pipeline, so the
// code panel needs no highlighter in the browser and matches every other code
// block on the site.
//
// public/lynx-runtime/ receives @lynx-js/web-core's prebuilt client so the Lynx
// runtime is fetched only by pages that actually mount a preview, instead of
// being bundled into the app graph. Its chunk and wasm URLs resolve from
// import.meta.url, so the directory can live anywhere as long as it stays whole.

import { execFileSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHighlighter } from 'shiki';

import { websiteShikiLangs, websiteShikiThemes } from '../mdx-options.ts';

const WEBSITE_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const REPO_ROOT = resolve(WEBSITE_ROOT, '..');
const PUBLIC_ROOT = join(WEBSITE_ROOT, 'public');
const EXAMPLES_DEST = join(PUBLIC_ROOT, 'lynx-examples');
const RUNTIME_DEST = join(PUBLIC_ROOT, 'lynx-runtime');
const EXAMPLE_BASE_PATH = '/lynx-examples';
const REPOSITORY_TREE_URL = 'https://github.com/octanejs/octane/tree/main';

// Workspace packages whose source decides what an example's bundle contains,
// beyond the package that owns the example directory itself. Keep this in step
// with what `pluginOctane` pulls in.
const TOOLCHAIN_PACKAGES = ['packages/lynx', 'packages/octane', 'packages/rspack-plugin-octane'];
const PNPM_EXECUTABLE = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const examples = JSON.parse(
	readFileSync(join(WEBSITE_ROOT, 'src/content/lynx-examples.json'), 'utf-8'),
);

// Directories that are build output, tooling state, or dependency trees — never
// example source.
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', '.rspeedy', '.cache']);

// Source panels show text. Images and fonts are shipped through dist/ (the
// bundle references them by URL); copying the originals would only duplicate
// megabytes of PNGs into the site's public directory.
const TEXT_EXTENSIONS = new Set([
	'.css',
	'.html',
	'.js',
	'.json',
	'.jsx',
	'.md',
	'.mjs',
	'.ts',
	'.tsrx',
	'.tsx',
]);

// Shiki language per source extension. `.tsrx` resolves to the site's own TSRX
// grammar, which is what makes an Octane component read the same here as in the
// docs.
const LANGUAGE_BY_EXTENSION = {
	'.css': 'css',
	'.html': 'html',
	'.js': 'javascript',
	'.json': 'json',
	'.jsx': 'jsx',
	'.md': 'markdown',
	'.mjs': 'javascript',
	'.ts': 'typescript',
	'.tsrx': 'tsrx',
	'.tsx': 'tsx',
};

// The docs' language set plus the one an example carries that no fence does.
const HIGHLIGHTER_LANGS = [...websiteShikiLangs, 'markdown'];

function languageFor(path) {
	return LANGUAGE_BY_EXTENSION[extname(path)] ?? 'text';
}

/**
 * Where the deployed site serves this example's assets from.
 *
 * The Lynx runtime resolves an emitted image URL itself, with no notion of
 * "relative to the bundle": Lynx Explorer fetches it over the network after a
 * QR scan, so on a real deployment the prefix has to carry an origin. Locally
 * there is no origin worth naming — a root-relative prefix keeps the web
 * preview working, and a phone cannot reach a dev server anyway.
 */
function assetPrefixFor(exampleId) {
	const path = `${EXAMPLE_BASE_PATH}/${exampleId}/dist/`;
	const origin = siteOrigin();
	return origin === null ? path : `${origin}${path}`;
}

function siteOrigin() {
	if (process.env.OCTANE_SITE_ORIGIN) return process.env.OCTANE_SITE_ORIGIN.replace(/\/$/, '');
	// A preview deployment must point at itself: production would 404 every
	// asset the branch adds, and silently serve a stale one for every asset it
	// changed.
	if (process.env.VERCEL_ENV === 'production') return 'https://octanejs.dev';
	if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
	return null;
}

/** Every file under `directory`, as paths relative to it, skipping build output. */
function walk(directory, base = directory) {
	const found = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.name.startsWith('.') || SKIP_DIRECTORIES.has(entry.name)) continue;
		const path = join(directory, entry.name);
		if (entry.isDirectory()) found.push(...walk(path, base));
		else found.push(relative(base, path));
	}
	return found;
}

function newestModification(directory) {
	let newest = 0;
	for (const path of walk(directory)) {
		newest = Math.max(newest, statSync(join(directory, path)).mtimeMs);
	}
	return newest;
}

/**
 * Rebuild only when the previous build cannot be reused.
 *
 * The asset prefix is baked into the bundle, so a stamp that records it is what
 * keeps a local `dist/` from being published with dev URLs (or a production one
 * from being reused on a preview deployment). The source timestamp covers the
 * ordinary case of editing an example and re-running the site.
 */
function buildIfStale(example, assetPrefix) {
	const sourceRoot = join(REPO_ROOT, example.directory);
	const distRoot = join(sourceRoot, 'dist');
	const stampPath = join(distRoot, '.octane-go-stamp.json');
	// The toolchain is part of the input, not just the example: an example's
	// bundle is produced from identical sources by the Rspeedy plugin and the
	// renderer it compiles against, so a change to either yields a different
	// bundle. A stamp that ignored them would publish the stale one — which is
	// exactly what happened when a renderer fix landed and every example was
	// "reused".
	const owner = owningPackageRoot(sourceRoot);
	const stamp = {
		assetPrefix,
		builtFrom: newestModification(sourceRoot),
		builtWith: Math.max(
			newestModification(join(owner, 'src')),
			...TOOLCHAIN_PACKAGES.map((pkg) => newestModification(join(REPO_ROOT, pkg, 'src'))),
		),
	};

	if (existsSync(stampPath)) {
		const previous = JSON.parse(readFileSync(stampPath, 'utf-8'));
		if (
			previous.assetPrefix === stamp.assetPrefix &&
			previous.builtFrom >= stamp.builtFrom &&
			previous.builtWith >= stamp.builtWith &&
			existsSync(join(distRoot, `${example.entry}.lynx.bundle`)) &&
			existsSync(join(distRoot, `${example.entry}.web.bundle`))
		) {
			console.info(`  reusing ${example.id}/dist (unchanged since the last build)`);
			return;
		}
	}

	// Rspeedy is a dependency of the package that owns the example, not of the
	// example folder, so run it from that package with --root.
	console.info(`  building ${example.id} (assetPrefix ${assetPrefix})`);
	execFileSync(
		PNPM_EXECUTABLE,
		['exec', 'rspeedy', 'build', '--root', relative(owner, sourceRoot)],
		{
			cwd: owner,
			stdio: 'inherit',
			env: { ...process.env, OCTANE_LYNX_ASSET_PREFIX: assetPrefix },
		},
	);
	writeFileSync(stampPath, `${JSON.stringify(stamp, null, 2)}\n`);
}

function owningPackageRoot(directory) {
	for (let current = directory; current !== REPO_ROOT; current = dirname(current)) {
		if (existsSync(join(current, 'package.json'))) return current;
	}
	throw new Error(`No package.json owns ${directory}`);
}

async function main() {
	console.info('Preparing Lynx examples…');
	rmSync(EXAMPLES_DEST, { recursive: true, force: true });
	mkdirSync(EXAMPLES_DEST, { recursive: true });

	const highlighter = await createHighlighter({
		themes: Object.values(websiteShikiThemes),
		langs: HIGHLIGHTER_LANGS,
	});

	for (const example of examples) {
		const sourceRoot = join(REPO_ROOT, example.directory);
		if (!existsSync(sourceRoot)) {
			throw new Error(
				`lynx-examples.json entry '${example.id}' points at a missing ${example.directory}`,
			);
		}

		const assetPrefix = assetPrefixFor(example.id);
		buildIfStale(example, assetPrefix);

		const destination = join(EXAMPLES_DEST, example.id);
		const sourceFiles = walk(sourceRoot)
			.filter((path) => TEXT_EXTENSIONS.has(extname(path)))
			.sort(compareSourcePaths);

		for (const path of sourceFiles) {
			const target = join(destination, path);
			mkdirSync(dirname(target), { recursive: true });
			cpSync(join(sourceRoot, path), target);
		}
		// Source maps are a local debugging aid for the example, not something the
		// site should serve; the bundles and their referenced assets are.
		cpSync(join(sourceRoot, 'dist'), join(destination, 'dist'), {
			recursive: true,
			filter: (from) => !from.endsWith('.map') && !from.endsWith('.octane-go-stamp.json'),
		});

		// @lynx-js/go-web's contract. `file` is the native bundle and `webFile`
		// the Lynx-for-Web one; a viewer that cannot render on the web still has
		// an entry to put behind a QR code.
		writeFileSync(
			join(destination, 'example-metadata.json'),
			`${JSON.stringify(
				{
					name: example.id,
					files: sourceFiles,
					templateFiles: [
						{
							name: example.entry,
							file: `dist/${example.entry}.lynx.bundle`,
							webFile: `dist/${example.entry}.web.bundle`,
						},
					],
					exampleGitBaseUrl: `${REPOSITORY_TREE_URL}/${dirname(example.directory)}`,
				},
				null,
				2,
			)}\n`,
		);

		writeFileSync(
			join(destination, 'example-source.json'),
			`${JSON.stringify(
				{
					defaultFile: example.defaultFile,
					files: sourceFiles.map((path) => ({
						path,
						language: languageFor(path),
						html: highlighter.codeToHtml(readFileSync(join(sourceRoot, path), 'utf-8').trimEnd(), {
							lang: languageFor(path),
							themes: websiteShikiThemes,
							defaultColor: false,
						}),
					})),
				},
				null,
				2,
			)}\n`,
		);

		console.info(`  packaged ${example.id}: ${sourceFiles.length} source files`);
	}

	highlighter.dispose();
	copyLynxRuntime();
	console.info(`Done. ${examples.length} examples in public/lynx-examples.`);
}

function copyLynxRuntime() {
	const require = createRequire(import.meta.url);
	const clientRoot = resolve(
		dirname(require.resolve('@lynx-js/web-core/package.json')),
		'dist/client_prod',
	);
	rmSync(RUNTIME_DEST, { recursive: true, force: true });
	cpSync(clientRoot, RUNTIME_DEST, { recursive: true });
	console.info('  copied the @lynx-js/web-core client to public/lynx-runtime');
}

/**
 * Order the file list the way the example reads rather than the way the
 * filesystem happens to return it: source before configuration, and directories
 * grouped, so the tree in the code panel opens on something worth reading.
 */
function compareSourcePaths(a, b) {
	const rank = (path) => (path.startsWith('src/') ? 0 : path.includes('/') ? 1 : 2);
	return rank(a) - rank(b) || a.localeCompare(b);
}

await main();
