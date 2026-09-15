import { resolve } from 'node:path';
import { createServer } from 'vite';
import { afterAll } from 'vitest';
import { octane } from '../../octane/src/compiler/vite.js';

const root = resolve(import.meta.dirname, '../../..');
let server: ReturnType<typeof createServer> | undefined;

afterAll(async () => {
	if (server) await (await server).close();
});

// SSR must execute a separately compiled module graph. A client-compiled
// component cannot be passed to Octane's server renderer, even in jsdom.
export async function runServerFixture<T>(
	fixture: string,
	name: string,
	...args: unknown[]
): Promise<T> {
	const runtime = resolve(root, 'packages/octane/src/server/index.ts');
	server ??= createServer({
		configFile: false,
		root,
		logLevel: 'silent',
		appType: 'custom',
		plugins: [octane({ ssr: true })],
		resolve: {
			alias: [
				{ find: /^octane$/, replacement: runtime },
				{ find: /^octane\/server$/, replacement: runtime },
			],
		},
		server: { middlewareMode: true, hmr: false },
	});
	const module = await (await server).ssrLoadModule(resolve(import.meta.dirname, fixture));
	if (typeof module[name] !== 'function')
		throw new Error(`Missing SSR fixture: ${fixture}#${name}`);
	return module[name](...args);
}
