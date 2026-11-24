// @vitest-environment node

/**
 * The Vite plugin's `dataClient` option: from the app's one data client
 * module it generates the data worker, emitted and served at the data
 * worker's stable path, and `octane/data/client`, whose `openDataStore`
 * opens a page's store over that worker with the build's contracts.
 */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build, createServer } from 'vite';
import { octane } from '../../src/compiler/vite.js';
import type { DataStore, Read } from '../../src/data/index.js';
import { createTempProject, type TempProject } from '../_temp-project.js';

const DATA = resolve(fileURLToPath(new URL('../../src/data', import.meta.url)));
const alias = [
	{ find: /^octane\/data$/, replacement: join(DATA, 'index.ts') },
	{
		find: /^octane\/internal\/data-client$/,
		replacement: join(DATA, '../internal/data-client.ts'),
	},
];

const projects: TempProject[] = [];
const closers: Array<() => unknown> = [];
afterEach(async () => {
	for (const close of closers.splice(0)) await close();
	for (const project of projects.splice(0)) project.dispose();
	vi.unstubAllGlobals();
	Reflect.deleteProperty(globalThis, 'validations');
});

/** A greeting read, a client whose transport counts its calls, and a page. */
function fixture(): string {
	const project = createTempProject('octane-data-client-vite');
	projects.push(project);
	const files: Record<string, string> = {
		'package.json': JSON.stringify({ type: 'module' }),
		'greeting.data.ts': `import { read } from 'octane/data';
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
		'data.client.ts': `import { defineDataClient } from 'octane/data';
export const sent: string[] = [];
export default defineDataClient({
	transport: async (request) => {
		sent.push(request.name);
		await new Promise((resolve) => setTimeout(resolve, 20));
		return { ok: true, value: 'hello' };
	},
});
`,
		'page.ts': `import { openDataStore } from 'octane/data/client';
import { greeting } from './greeting.data.ts';
export { greeting, openDataStore };
`,
	};
	for (const [file, source] of Object.entries(files))
		writeFileSync(join(project.root, file), source);
	return project.root;
}

describe('the Vite plugin’s data client', () => {
	it('opens every store of an account over one generated data worker, with the build’s contracts', async () => {
		const root = fixture();
		const server = await createServer({
			root,
			configFile: false,
			logLevel: 'silent',
			resolve: { alias },
			plugins: [octane({ hmr: false, dataClient: 'data.client.ts' })],
			server: { middlewareMode: true },
		});
		closers.push(() => server.close());
		// The worker's global: it serves each tab that connects, as a SharedWorker does.
		const connects: Array<(event: { ports: MessagePort[] }) => void> = [];
		vi.stubGlobal('indexedDB', new IDBFactory());
		vi.stubGlobal('addEventListener', (type: string, listener: never) => {
			if (type === 'connect') connects.push(listener);
		});
		await server.ssrLoadModule('/@id/__x00__octane:data-client-worker');
		expect(connects).toHaveLength(1);
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

		const page = (await server.ssrLoadModule('/page.ts')) as {
			greeting: Read<void, string>;
			openDataStore(account: string): DataStore;
		};
		const client = (await server.ssrLoadModule('/data.client.ts')) as { sent: string[] };
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
		// Both tabs share the worker's owner, so it asked once for both, and validated the reply
		// with the build's contracts, which both tabs share: neither tab validated it again.
		expect(client.sent).toEqual(['greeting']);
		expect((globalThis as { validations?: number }).validations).toBe(1);
	});

	it('emits the generated data worker at its stable path, and serves it there in dev', async () => {
		const root = fixture();
		await build({
			root,
			configFile: false,
			logLevel: 'silent',
			resolve: { alias },
			plugins: [octane({ hmr: false, dataClient: 'data.client.ts' })],
			build: { outDir: 'dist', minify: false, rolldownOptions: { input: join(root, 'page.ts') } },
		});
		const { existsSync } = await import('node:fs');
		expect(existsSync(join(root, 'dist/_octane/data-worker.js'))).toBe(true);

		const server = await createServer({
			root,
			configFile: false,
			logLevel: 'silent',
			resolve: { alias },
			plugins: [octane({ dataClient: 'data.client.ts' })],
			server: { port: 0, host: '127.0.0.1' },
		});
		closers.push(() => server.close());
		await server.listen();
		const origin = server.resolvedUrls!.local[0]!.replace(/\/$/, '');
		const entry = await fetch(`${origin}/_octane/data-worker.js`);
		const imported = (await entry.text()).match(/^import "([^"]+)";/)?.[1];
		const worker = await fetch(origin + imported);
		expect(worker.status).toBe(200);
	});

	it('refuses `dataClient` together with `dataWorker`, or without the manifest', () => {
		expect(() => octane({ dataClient: 'a.ts', dataWorker: 'b.ts' })).toThrow(/not both/);
		expect(() => octane({ dataClient: 'a.ts', data: false })).toThrow(/manifest/);
	});
});
