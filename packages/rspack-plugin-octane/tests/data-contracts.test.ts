// @vitest-environment node

import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import rspack, { type Stats } from '@rspack/core';
import { build, createServer, type Rollup } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import { octane } from '../../octane/src/compiler/vite.js';
import { OctaneRspackPlugin } from '../src/index.js';
import { createFixture, write } from './_css-module-build.js';

const FIXTURE = fileURLToPath(
	new URL('../../octane/tests/compiler/_fixtures/data-program/src/', import.meta.url),
);
const DIAGNOSTIC = /src\/\S+ \[OCTANE_DATA_[A-Z_]+\] .*$/gm;
// The runtime stays external; the manifest is the plugins' own module.
const EXTERNAL = /^octane(?:\/(?!data\/manifest$)|$)/;

const roots: string[] = [];
afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function fixture() {
	const files: Record<string, string> = {};
	for (const name of readdirSync(FIXTURE)) {
		files[`src/${name}`] = readFileSync(join(FIXTURE, name), 'utf8');
	}
	const root = createFixture(files);
	roots.push(root);
	return root;
}

const lines = (messages: string[]) => ({
	errors: messages.flatMap((message) => message.match(DIAGNOSTIC) ?? []).sort(),
});

async function viteBuild(root: string) {
	let manifest: string | undefined;
	const warnings: string[] = [];
	let error = '';
	try {
		await build({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [
				octane({ hmr: false }),
				{
					name: 'capture-manifest',
					transform(code, id) {
						if (id.includes('octane:data-manifest')) manifest = code;
					},
				},
			],
			build: {
				write: false,
				minify: false,
				lib: { entry: 'src/entry.ts', formats: ['es'] },
				rollupOptions: {
					external: (id) => EXTERNAL.test(id),
					onLog(level, log: Rollup.RollupLog) {
						if (level === 'warn') warnings.push(log.message);
					},
				},
			},
		});
	} catch (caught) {
		error = String((caught as Error).message);
	}
	return { manifest, errors: lines([error]).errors, warnings: lines(warnings).errors };
}

async function rspackBuild(root: string) {
	const compiler = rspack({
		context: root,
		mode: 'production',
		target: 'web',
		entry: './src/entry.ts',
		devtool: false,
		externalsType: 'commonjs',
		externals: [EXTERNAL],
		output: { path: join(root, 'dist-rspack'), library: { type: 'commonjs2' } },
		optimization: { minimize: false },
		plugins: [new OctaneRspackPlugin({ hmr: false, parallel: false })],
	});
	const stats = await new Promise<Stats>((resolve, reject) =>
		compiler.run((error, result) => (error ? reject(error) : resolve(result!))),
	);
	await new Promise((resolve) => compiler.close(resolve));
	const manifest = [...stats.compilation.modules]
		.find((module) => (module as { resource?: string }).resource?.endsWith('data-manifest.js'))
		?.originalSource()
		?.source()
		.toString();
	return {
		manifest,
		errors: lines(stats.compilation.errors.map((error) => error.message)).errors,
		warnings: lines(stats.compilation.warnings.map((warning) => warning.message)).errors,
	};
}

describe('octane/data contract check in the build plugins', () => {
	it('reports the same program diagnostics and generates the same manifest', async () => {
		const root = fixture();
		const vite = await viteBuild(root);
		const rspackResult = await rspackBuild(root);

		expect(vite.errors).toEqual([
			'src/books.data.ts:12:14 [OCTANE_DATA_CONTRACT_UNHANDLED] `stats` is handled 2 times. Serve each contract from one `handle(stats, …)` or `defineHandler` entry.',
			'src/extra.data.ts:4:14 [OCTANE_DATA_CONTRACT_UNHANDLED] `orphan` is used in src/page.ts:11, but no `createDataHandler` serves it. Add `handle(orphan, …)`, or serve its module with `defineHandler`.',
			'src/extra.data.ts:5:14 [OCTANE_DATA_CONTRACT_DECLARATION] `shadow` reuses the name "books.list" of `list` in src/books.data.ts. Give each contract its own name.',
		]);
		expect(vite.warnings.map((warning) => warning.split(' [')[0])).toEqual([
			'src/books.data.ts:14:14',
			'src/books.data.ts:15:14',
			'src/extra.data.ts:5:14',
		]);
		expect(rspackResult.errors).toEqual(vite.errors);
		expect(rspackResult.warnings).toEqual(vite.warnings);

		// Every read, view, write, and feed in name order; the entity and the
		// shared schema are not contracts, and the second `books.list` is dropped.
		expect(vite.manifest).toBeDefined();
		expect(rspackResult.manifest).toBe(vite.manifest);
		const imported = [...vite.manifest!.matchAll(/(\w+) as (c\d+)/g)].map(([, name]) => name);
		expect(imported).toEqual(['addBook', 'archive', 'changes', 'list', 'stats', 'orphan']);
		expect(vite.manifest).toContain('export const writes = [c0, c5];');
	}, 60_000);

	it("reports a module's own rule violations in both builds", async () => {
		const root = fixture();
		writeFileSync(
			join(root, 'src/page.ts'),
			`import { stats } from './books.data.ts';\nexport const load = () => remember(stats);\n`,
		);
		const escape = expect.stringMatching(/^src\/page\.ts:2:\d+ \[OCTANE_DATA_CONTRACT_ESCAPE\]/);
		expect((await viteBuild(root)).errors).toEqual(expect.arrayContaining([escape]));
		expect((await rspackBuild(root)).errors).toEqual(expect.arrayContaining([escape]));
	}, 60_000);

	it('leaves an app that does not import the manifest alone', async () => {
		const root = fixture();
		writeFileSync(join(root, 'src/entry.ts'), `export { load } from './page.ts';\n`);
		const vite = await viteBuild(root);
		const rspackResult = await rspackBuild(root);
		expect(vite).toEqual({ manifest: undefined, errors: [], warnings: [] });
		expect(rspackResult).toEqual({ manifest: undefined, errors: [], warnings: [] });
	}, 60_000);

	it('regenerates the manifest in Vite dev when a contract module is added or removed', async () => {
		const root = fixture();
		const server = await createServer({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [octane()],
			server: { middlewareMode: true, ws: false },
			optimizeDeps: { noDiscovery: true, include: [] },
		});
		const client = server.environments.client;
		const manifest = async () => {
			const { id } = (await client.pluginContainer.resolveId('octane/data/manifest'))!;
			return (await client.transformRequest(id))!.code;
		};
		try {
			expect(await manifest()).not.toContain('later');
			const added = write(
				root,
				'src/later.data.ts',
				`import { read } from 'octane/data';\nexport const later = read({ name: 'a.later' });\n`,
			);
			server.watcher.emit('add', added);
			expect(await manifest()).toContain('later');
			rmSync(added);
			server.watcher.emit('unlink', added);
			expect(await manifest()).not.toContain('later');
		} finally {
			await server.close();
		}
	}, 60_000);
});
