import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
	getPublishablePackages,
	REPO_ROOT,
	validateWorkspacePackages,
} from './workspace-packages.mjs';

const packages = getPublishablePackages();
const packageVersions = new Map(packages.map((pkg) => [pkg.name, pkg.version]));
const octaneSingletonConsumers = new Set([
	'@octanejs/app-core',
	'@octanejs/rspack-plugin',
	'@octanejs/rsbuild-plugin',
	'@octanejs/vite-plugin',
]);
const inventoryErrors = validateWorkspacePackages(packages);
if (inventoryErrors.length) {
	console.error(`cannot pack an invalid package inventory:\n  - ${inventoryErrors.join('\n  - ')}`);
	process.exit(1);
}

function tarOutput(args) {
	return execFileSync('tar', args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

function collectStrings(value, label, output) {
	if (typeof value === 'string') {
		output.push({ label, value });
		return;
	}
	if (Array.isArray(value)) {
		for (let index = 0; index < value.length; index++) {
			collectStrings(value[index], `${label}[${index}]`, output);
		}
		return;
	}
	if (value && typeof value === 'object') {
		for (const [key, child] of Object.entries(value)) {
			collectStrings(child, `${label}.${key}`, output);
		}
	}
}

function targetExists(target, files) {
	if (!target.startsWith('./')) return false;
	const relative = target.slice(2);
	if (!relative.includes('*')) return files.has(relative.replace(/\/$/, ''));
	const pattern = new RegExp(
		`^${relative
			.split('*')
			.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
			.join('.+')}$`,
	);
	return [...files].some((file) => pattern.test(file));
}

function validatePackedPackage(pkg, manifest, files) {
	const errors = [];
	if (manifest.name !== pkg.name || manifest.version !== pkg.version) {
		errors.push(
			`packed identity is ${manifest.name}@${manifest.version}, expected ${pkg.name}@${pkg.version}`,
		);
	}

	const allStrings = [];
	collectStrings(manifest, 'package.json', allStrings);
	for (const entry of allStrings) {
		if (/^(?:workspace|catalog):/.test(entry.value)) {
			errors.push(`${entry.label} retains unresolved protocol ${JSON.stringify(entry.value)}`);
		}
	}

	if (!manifest.exports) errors.push('package.json has no exports field');
	if (manifest.engines?.node !== '>=22') {
		errors.push(
			`packed engines.node is ${JSON.stringify(manifest.engines?.node)}, expected ">=22"`,
		);
	}

	if (pkg.role === 'framework binding' || octaneSingletonConsumers.has(pkg.name)) {
		if (manifest.dependencies?.octane !== undefined) {
			errors.push('packed manifest installs a duplicate octane runtime dependency');
		}
		const expectedOctane = packageVersions.get('octane');
		if (manifest.peerDependencies?.octane !== expectedOctane) {
			errors.push(
				`packed octane peer is ${JSON.stringify(manifest.peerDependencies?.octane)}, expected exact ${JSON.stringify(expectedOctane)}`,
			);
		}
	}
	if (pkg.name === '@octanejs/adapter-vercel') {
		const expectedAppCore = packageVersions.get('@octanejs/app-core');
		if (manifest.peerDependencies?.['@octanejs/app-core'] !== expectedAppCore) {
			errors.push(
				`packed app-core peer is ${JSON.stringify(manifest.peerDependencies?.['@octanejs/app-core'])}, expected exact ${JSON.stringify(expectedAppCore)}`,
			);
		}
	}
	const targets = [];
	for (const field of ['main', 'module', 'types', 'typings', 'exports', 'bin']) {
		if (manifest[field] != null) collectStrings(manifest[field], field, targets);
	}
	for (const target of targets) {
		if (!target.value.startsWith('./')) {
			// Legacy package entry fields and bin targets may legally omit `./`.
			// Export-map targets may not, so keep that stricter contract.
			if (/^(?:main|module|types|typings|bin)(?:\.|$)/.test(target.label)) {
				const normalized = `./${target.value}`;
				if (!targetExists(normalized, files)) {
					errors.push(`${target.label} points to missing ${JSON.stringify(target.value)}`);
				}
				continue;
			}
			errors.push(`${target.label} is not package-relative: ${JSON.stringify(target.value)}`);
			continue;
		}
		if (!targetExists(target.value, files)) {
			errors.push(`${target.label} points to missing ${JSON.stringify(target.value)}`);
		}
	}

	for (const file of files) {
		if (/(^|\/)(?:tests?|__tests__|coverage)(?:\/|$)/.test(file)) {
			errors.push(`tarball unexpectedly contains test artifact ${file}`);
		}
	}

	return errors;
}

function requireArchive(archives, packageName) {
	const archive = archives.get(packageName);
	if (!archive) throw new Error(`no packed archive was recorded for ${packageName}`);
	return archive;
}

/**
 * Install a real consumer outside the workspace, then compile one application
 * against the packed core and a raw-source binding in both client and server
 * modes. This catches peer-layout and source-publication failures that tarball
 * inspection alone cannot see.
 */
async function validatePackedConsumer(tempRoot, archives) {
	const consumerDirectory = path.join(tempRoot, 'external-consumer');
	const sourceDirectory = path.join(consumerDirectory, 'src');
	mkdirSync(sourceDirectory, { recursive: true });
	writeFileSync(
		path.join(consumerDirectory, 'package.json'),
		JSON.stringify(
			{
				name: 'octane-packed-consumer-smoke',
				private: true,
				type: 'module',
				engines: { node: '>=22' },
				dependencies: {
					'@apollo/client': '4.2.6',
					'@octanejs/apollo-client': `file:${requireArchive(archives, '@octanejs/apollo-client')}`,
					'@octanejs/hook-form': `file:${requireArchive(archives, '@octanejs/hook-form')}`,
					graphql: '^16.11.0',
					octane: `file:${requireArchive(archives, 'octane')}`,
					rxjs: '^7.8.2',
				},
			},
			null,
			2,
		) + '\n',
	);
	writeFileSync(
		path.join(sourceDirectory, 'App.tsrx'),
		`import { ApolloClient, InMemoryCache } from '@octanejs/apollo-client';
import { ApolloProvider, useApolloClient } from '@octanejs/apollo-client/react';
import { useForm } from '@octanejs/hook-form';

const client = new ApolloClient({ cache: new InMemoryCache() });

function ApolloProbe() @{
	const activeClient = useApolloClient();
	<span data-apollo={activeClient === client ? 'connected' : 'missing'}>Apollo</span>
}

export function App() @{
	const form = useForm({ defaultValues: { name: 'Ada' } });
	<div data-probe="bindings-ran">
		<form>
			<input {...form.register('name')} />
		</form>
		<ApolloProvider client={client}>
			<ApolloProbe />
		</ApolloProvider>
	</div>
}
`,
	);
	writeFileSync(
		path.join(sourceDirectory, 'main.tsrx'),
		`import { createRoot } from 'octane';
import { App } from './App.tsrx';

const target = document.getElementById('app');
if (target) createRoot(target).render(App);
`,
	);
	writeFileSync(
		path.join(sourceDirectory, 'entry-server.ts'),
		`import { renderToString } from 'octane/server';
import { App } from './App.tsrx';

export function renderProbe() {
	return renderToString(App).html;
}
`,
	);
	writeFileSync(
		path.join(consumerDirectory, 'index.html'),
		`<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.tsrx"></script></body></html>\n`,
	);

	execFileSync(
		'pnpm',
		['install', '--prefer-offline', '--ignore-scripts', '--config.auto-install-peers=false'],
		{
			cwd: consumerDirectory,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);

	const consumerRequire = createRequire(path.join(consumerDirectory, 'package.json'));
	const directRuntime = realpathSync(consumerRequire.resolve('octane'));
	const bindingEntry = consumerRequire.resolve('@octanejs/hook-form');
	const peerRuntime = realpathSync(createRequire(bindingEntry).resolve('octane'));
	if (peerRuntime !== directRuntime) {
		throw new Error(
			`binding resolved a second Octane runtime:\n  app: ${directRuntime}\n  binding: ${peerRuntime}`,
		);
	}
	const virtualStoreEntries = readdirSync(path.join(consumerDirectory, 'node_modules/.pnpm'));
	const installedRuntimes = virtualStoreEntries.filter((entry) => /^octane@/.test(entry));
	if (installedRuntimes.length !== 1) {
		throw new Error(
			`expected one physical Octane install, found ${installedRuntimes.length}: ${installedRuntimes.join(', ')}`,
		);
	}

	const compilerPluginEntry = consumerRequire.resolve('octane/compiler/vite');
	const { octane } = await import(pathToFileURL(compilerPluginEntry).href);
	const toolRequire = createRequire(
		path.join(REPO_ROOT, 'packages/vite-plugin-octane/package.json'),
	);
	const { build: viteBuild } = await import(pathToFileURL(toolRequire.resolve('vite')).href);
	await viteBuild({
		root: consumerDirectory,
		configFile: false,
		logLevel: 'silent',
		plugins: [octane({ hmr: false })],
		build: {
			emptyOutDir: true,
			outDir: 'dist/client',
			rollupOptions: {
				input: 'src/main.tsrx',
				output: { entryFileNames: 'entry.mjs' },
			},
			target: 'esnext',
		},
	});
	await viteBuild({
		root: consumerDirectory,
		configFile: false,
		logLevel: 'silent',
		plugins: [octane({ hmr: false })],
		build: {
			emptyOutDir: true,
			outDir: 'dist/server',
			rollupOptions: { output: { entryFileNames: 'entry.mjs' } },
			ssr: 'src/entry-server.ts',
			target: 'esnext',
		},
	});

	const serverBundle = path.join(consumerDirectory, 'dist/server/entry.mjs');
	const { renderProbe } = await import(pathToFileURL(serverBundle).href);
	const html = renderProbe();
	if (
		!html.includes('data-probe="bindings-ran"') ||
		!html.includes('name="name"') ||
		!html.includes('data-apollo="connected"')
	) {
		throw new Error(`executed Hook Form probe returned unexpected HTML: ${html}`);
	}

	console.log(
		'installed packed octane + Hook Form + Apollo Client without React; Vite client/server builds and executed binding SSR passed',
	);
}

const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'octane-pack-check-'));
const failures = [];
const packedArchives = new Map();
let rawTsrxFiles = 0;

try {
	for (const pkg of packages) {
		const outputDirectory = path.join(tempRoot, pkg.dir);
		mkdirSync(outputDirectory, { recursive: true });
		try {
			execFileSync(
				'pnpm',
				['--dir', pkg.directory, 'pack', '--pack-destination', outputDirectory],
				{ cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
			);
			const archiveFiles = readdirSync(outputDirectory).filter((file) => file.endsWith('.tgz'));
			if (archiveFiles.length !== 1) {
				throw new Error(`expected one .tgz, found ${archiveFiles.length}`);
			}
			const archive = path.join(outputDirectory, archiveFiles[0]);
			packedArchives.set(pkg.name, archive);
			const manifest = JSON.parse(tarOutput(['-xOf', archive, 'package/package.json']));
			const files = new Set(
				tarOutput(['-tzf', archive])
					.split('\n')
					.filter(Boolean)
					.map((file) => file.replace(/^package\//, '').replace(/\/$/, '')),
			);
			rawTsrxFiles += [...files].filter((file) => file.endsWith('.tsrx')).length;
			const errors = validatePackedPackage(pkg, manifest, files);
			if (errors.length) failures.push(`${pkg.name}:\n    - ${errors.join('\n    - ')}`);
			else console.log(`packed ${pkg.name} (${files.size} files)`);
		} catch (error) {
			const detail = [error.message, error.stdout, error.stderr].filter(Boolean).join('\n');
			failures.push(`${pkg.name}: pack failed\n${detail}`);
		}
	}
	if (!failures.length) {
		try {
			await validatePackedConsumer(tempRoot, packedArchives);
		} catch (error) {
			const detail = [error.message, error.stdout, error.stderr].filter(Boolean).join('\n');
			failures.push(`external packed consumer: validation failed\n${detail}`);
		}
	}
} finally {
	rmSync(tempRoot, { recursive: true, force: true });
}

if (failures.length) {
	console.error(`package pack validation failed:\n\n${failures.join('\n\n')}`);
	process.exit(1);
}

console.log(
	`validated ${packages.length} publishable package tarball(s); preserved ${rawTsrxFiles} raw TSRX source file(s).`,
);
