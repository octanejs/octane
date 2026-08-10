import { resolve } from 'node:path';
import { createServer } from 'vite';
import { octane } from '../../../octane/src/compiler/vite.js';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');

export async function renderDropzoneHydrationFixture(props: unknown) {
	const serverRuntime = resolve(repositoryRoot, 'packages/octane/src/server/index.ts');
	const server = await createServer({
		configFile: false,
		root: repositoryRoot,
		logLevel: 'silent',
		appType: 'custom',
		plugins: [octane({ ssr: true })],
		resolve: {
			alias: [
				{ find: /^octane$/, replacement: serverRuntime },
				{ find: /^octane\/server$/, replacement: serverRuntime },
			],
		},
		server: { middlewareMode: true, hmr: false },
	});
	try {
		const [fixture, runtime] = await Promise.all([
			server.ssrLoadModule(
				resolve(repositoryRoot, 'packages/react-dropzone/tests/probes/dropzone.tsrx'),
			),
			server.ssrLoadModule(serverRuntime),
		]);
		return runtime.renderToString(fixture.HookProbe, props);
	} finally {
		await server.close();
	}
}
