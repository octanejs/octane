// @vitest-environment node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const packageDirectory = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageDirectory, '../..');

function collectFiles(entryPath: string): Array<string> {
	if (!existsSync(entryPath)) return [];
	if (!statSync(entryPath).isDirectory()) return [entryPath];
	return readdirSync(entryPath).flatMap((entry) => collectFiles(resolve(entryPath, entry)));
}

describe('@octanejs/tanstack-start package boundary', () => {
	it('preserves hydration when a production consumer imports the default client entry for its effects', async () => {
		const clientEntry = resolve(packageDirectory, 'src/default-entry/client.js');
		const result = await build({
			stdin: {
				contents: `import ${JSON.stringify(clientEntry)};`,
				resolveDir: repositoryRoot,
				sourcefile: 'start-consumer-bootstrap.js',
			},
			bundle: true,
			format: 'iife',
			logLevel: 'silent',
			minify: true,
			platform: 'browser',
			treeShaking: true,
			write: false,
			plugins: [
				{
					name: 'start-consumer-bootstrap-dependencies',
					setup(builder) {
						builder.onResolve({ filter: /^octane$/ }, () => ({
							path: 'octane',
							namespace: 'start-consumer-bootstrap',
						}));
						builder.onResolve({ filter: /^\.\.\/client\.js$/ }, () => ({
							path: 'start-client',
							namespace: 'start-consumer-bootstrap',
						}));
						builder.onLoad({ filter: /^octane$/, namespace: 'start-consumer-bootstrap' }, () => ({
							contents: `
export function initializeHydrationEventCapture() {
	globalThis.bootstrap.capture();
}
export function hydrateRoot(container, component, options) {
	globalThis.bootstrap.hydrate(container, component, options);
}
`,
							loader: 'js',
						}));
						builder.onLoad(
							{ filter: /^start-client$/, namespace: 'start-consumer-bootstrap' },
							() => ({
								contents: `
export const StartClient = globalThis.bootstrap.component;
export function hydrateStart() {
	return globalThis.bootstrap.start();
}
`,
								loader: 'js',
							}),
						);
					},
				},
			],
		});
		const container = { id: '__app' };
		const router = { id: 'hydrated-router' };
		const component = () => undefined;
		const calls: {
			capture: number;
			start: number;
			hydrations: Array<{ container: unknown; component: unknown; router: unknown }>;
		} = { capture: 0, start: 0, hydrations: [] };
		const context = {
			document: {
				getElementById: (id: string) => (id === '__app' ? container : null),
			},
			bootstrap: {
				component,
				capture() {
					calls.capture++;
				},
				start() {
					calls.start++;
					return Promise.resolve(router);
				},
				hydrate(root: unknown, client: unknown, options: { router: unknown }) {
					calls.hydrations.push({ container: root, component: client, router: options.router });
				},
			},
		};

		runInNewContext(result.outputFiles[0].text, context);

		expect(calls.capture).toBe(1);
		expect(calls.start).toBe(1);

		await Promise.resolve();

		expect(calls.hydrations).toEqual([{ container, component, router }]);
	});

	it('continues tree-shaking an unused package-root import from production consumer bundles', async () => {
		const packageEntry = resolve(packageDirectory, 'src/index.js');
		const result = await build({
			stdin: {
				contents: `import '@octanejs/tanstack-start'; globalThis.consumerExecuted = true;`,
				resolveDir: packageDirectory,
				sourcefile: 'start-consumer-unused-import.js',
			},
			bundle: true,
			format: 'iife',
			logLevel: 'silent',
			metafile: true,
			minify: true,
			platform: 'browser',
			treeShaking: true,
			write: false,
			plugins: [
				{
					name: 'unused-start-package-dependencies',
					setup(builder) {
						builder.onResolve({ filter: /.*/ }, (args) =>
							args.importer === packageEntry ? { path: args.path, external: true } : undefined,
						);
					},
				},
			],
		});
		const context = { consumerExecuted: false };
		const includedModules = Object.keys(Object.values(result.metafile!.outputs)[0].inputs);

		runInNewContext(result.outputFiles[0].text, context);

		expect(context.consumerExecuted).toBe(true);
		expect(includedModules.some((entry) => resolve(repositoryRoot, entry) === packageEntry)).toBe(
			false,
		);
	});

	it('publishes only repository-owned Start and router integration', () => {
		const manifestPath = resolve(packageDirectory, 'package.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
			files: Array<string>;
			dependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		const dependencyNames = Object.keys({
			...manifest.dependencies,
			...manifest.peerDependencies,
			...manifest.devDependencies,
		});
		const forbiddenPackagePrefixes = ['@tanstack/octane-start', '@tanstack/octane-router'];

		expect(
			dependencyNames.filter((name) =>
				forbiddenPackagePrefixes.some((prefix) => name.startsWith(prefix)),
			),
		).toEqual([]);
		expect(manifest.dependencies?.['@octanejs/tanstack-router']).toBe('workspace:*');

		const publishedFiles = [
			manifestPath,
			...manifest.files.flatMap((entry) => collectFiles(resolve(packageDirectory, entry))),
		];
		const forbiddenPublishedText = [
			...forbiddenPackagePrefixes,
			'packages/tanstack-start/vendor',
			'pkg.pr.new',
		];
		const violations = publishedFiles.flatMap((file) => {
			const source = readFileSync(file, 'utf8');
			return forbiddenPublishedText
				.filter((text) => source.includes(text))
				.map((text) => `${file}: ${text}`);
		});

		expect(violations).toEqual([]);
	});

	it('does not retain upstream vendor artifacts or workspace registration', () => {
		const workspace = readFileSync(resolve(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8');

		expect(existsSync(resolve(packageDirectory, 'vendor'))).toBe(false);
		expect(existsSync(resolve(packageDirectory, 'tanstack-octane-native-injection.patch'))).toBe(
			false,
		);
		expect(workspace).not.toContain('packages/tanstack-start/vendor');
	});
});
