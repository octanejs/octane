// @vitest-environment node

/**
 * The Rspack plugin's `dataClient` option: from the app's one data client
 * module it builds the data worker at its stable path, and generates
 * `octane/data/client`, whose `openDataStore` opens a page's store over that
 * worker with the build's contracts. The worker and the page are separate
 * bundles, each with its own copy of `octane/data`, as in a browser.
 */
import { createRequire } from 'node:module';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runInThisContext } from 'node:vm';
import rspack, { type Configuration, type Stats } from '@rspack/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OctaneRspackPlugin } from '../src/index.js';
import { createFixture } from './_css-module-build.js';

// The octane package's test database, which the data worker records the signed-in account in.
const { IDBFactory } = createRequire(new URL('../../octane/package.json', import.meta.url))(
	'fake-indexeddb',
) as { IDBFactory: new () => IDBFactory };

const roots: string[] = [];
const closers: Array<() => unknown> = [];
afterEach(async () => {
	for (const close of closers.splice(0)) await close();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
	vi.unstubAllGlobals();
	Reflect.deleteProperty(globalThis, 'validations');
	Reflect.deleteProperty(globalThis, 'sent');
});

function fixture() {
	const root = createFixture({
		'src/greeting.data.ts': `import { read } from 'octane/data';
export const greeting = read({
	name: 'greeting',
	output: {
		'~standard': {
			version: 1,
			vendor: 'test',
			validate: (value) => ((globalThis.validations = (globalThis.validations ?? 0) + 1), { value }),
		},
	},
});
`,
		'src/data.client.ts': `import { defineDataClient } from 'octane/data';
export default defineDataClient({
	transport: async (request) => {
		(globalThis.sent ??= []).push(request.name);
		await new Promise((resolve) => setTimeout(resolve, 20));
		return { ok: true, value: 'hello' };
	},
});
`,
		'src/page.ts': `export { openDataStore } from 'octane/data/client';
export { greeting } from './greeting.data.ts';
`,
	});
	roots.push(root);
	return root;
}

async function compile(config: Configuration) {
	const compiler = rspack(config);
	const stats = await new Promise<Stats>((resolve, reject) =>
		compiler.run((error, result) => (error ? reject(error) : resolve(result as Stats))),
	);
	await new Promise((resolve) => compiler.close(resolve));
	expect(stats.compilation.errors.map((error) => error.message)).toEqual([]);
}

describe('the Rspack plugin’s data client', () => {
	it('builds the data worker at its stable path, and opens every store of an account over it', async () => {
		const root = fixture();
		const plugins = [
			new OctaneRspackPlugin({ hmr: false, parallel: false, dataClient: './src/data.client.ts' }),
		];
		// The octane package ships its TypeScript source, importing its siblings as `.js`.
		const base = {
			context: root,
			mode: 'production' as const,
			devtool: false,
			plugins,
			resolve: { extensionAlias: { '.js': ['.ts', '.js'] } },
		} satisfies Configuration;
		await compile({
			...base,
			target: 'web',
			entry: {},
			output: { path: join(root, 'dist-client') },
			optimization: { minimize: false },
		});
		await compile({
			...base,
			target: 'node',
			entry: { page: './src/page.ts' },
			output: {
				path: join(root, 'dist-server'),
				filename: '[name].cjs',
				library: { type: 'commonjs2' },
			},
			optimization: { minimize: false },
		});

		// The worker's global: it serves each tab that connects, as a SharedWorker does.
		const connects: Array<(event: { ports: MessagePort[] }) => void> = [];
		vi.stubGlobal('indexedDB', new IDBFactory());
		vi.stubGlobal('self', globalThis);
		vi.stubGlobal('addEventListener', (type: string, listener: never) => {
			if (type === 'connect') connects.push(listener);
		});
		runInThisContext(readFileSync(join(root, 'dist-client/_octane/data-worker.js'), 'utf8'));
		await vi.waitFor(() => expect(connects).toHaveLength(1));
		vi.stubGlobal(
			'SharedWorker',
			class extends EventTarget {
				port: MessagePort;
				constructor() {
					super();
					const channel = new MessageChannel();
					connects[0]!({ ports: [channel.port1] });
					this.port = channel.port2;
					closers.push(() => (channel.port1.close(), channel.port2.close()));
				}
			},
		);

		const page = createRequire(import.meta.url)(join(root, 'dist-server/page.cjs'));
		const stores = [page.openDataStore('ada'), page.openDataStore('ada')];
		const values = await Promise.all(
			stores.map(async (store) => {
				closers.push(() => store.dispose());
				const handle = store.read(page.greeting);
				closers.push(handle.subscribe(() => {}));
				await vi.waitFor(() => expect(handle.getSnapshot().status).toBe('ready'));
				return handle.getSnapshot().value;
			}),
		);
		expect(values).toEqual(['hello', 'hello']);
		// One request and one validation, both in the worker, for both tabs.
		expect((globalThis as { sent?: string[] }).sent).toEqual(['greeting']);
		expect((globalThis as { validations?: number }).validations).toBe(1);
	}, 60_000);

	it('refuses `dataClient` together with `dataWorker`, or without the manifest', () => {
		expect(() => new OctaneRspackPlugin({ dataClient: './a.ts', dataWorker: './b.ts' })).toThrow(
			/not both/,
		);
		expect(() => new OctaneRspackPlugin({ dataClient: './a.ts', data: false })).toThrow(/manifest/);
	});
});
