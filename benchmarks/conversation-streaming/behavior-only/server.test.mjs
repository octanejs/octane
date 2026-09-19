import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { Script } from 'node:vm';

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, '../../..');
const require = createRequire(path.join(REPO, 'packages/octane/package.json'));

async function buildServer(t) {
	const directory = await mkdtemp(path.join(tmpdir(), 'octane-behavior-server-test-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const { build } = await import(pathToFileURL(require.resolve('esbuild')).href);
	const { createOctaneCompiler } = await import(
		pathToFileURL(require.resolve('octane/compiler/bundler')).href
	);
	const compiler = createOctaneCompiler({
		root: REPO,
		environment: 'server',
		requireDirective: false,
		dev: false,
		hmr: false,
		profile: false,
	});
	const outfile = path.join(directory, 'server.mjs');
	await build({
		stdin: {
			contents: `export { render, diagnostics } from './server.ts';
				export { setTransport } from 'test:renderer';`,
			resolveDir: HERE,
		},
		outfile,
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'es2022',
		tsconfigRaw: { compilerOptions: {} },
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		plugins: [
			{
				name: 'fragment-real-renderer-output',
				setup(builder) {
					builder.onResolve({ filter: /^test:renderer$|^octane(?:\/|$)/ }, (args) => {
						if (
							args.path === 'test:renderer' ||
							(args.path === 'octane/server' && args.importer === path.join(HERE, 'server.ts'))
						)
							return { path: 'renderer', namespace: 'test' };
						return { path: require.resolve(args.path === 'octane' ? 'octane/server' : args.path) };
					});
					builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
						contents: `export * from 'octane/server';
							import { renderToReadableStream as render } from 'octane/server';
							let transport;
							export function setTransport(next) { transport = next; }
							export async function renderToReadableStream(...args) {
								return transport(await render(...args));
							}`,
					}));
					builder.onResolve({ filter: /^\.\/loaders\.ts$/ }, ({ importer }) =>
						importer === path.join(HERE, 'State.ts')
							? { path: path.join(HERE, 'server-loaders.ts') }
							: undefined,
					);
					builder.onLoad({ filter: /\.(?:ts|tsrx)$/ }, async ({ path: file }) => {
						if (!file.startsWith(HERE + path.sep)) return;
						const source = await readFile(file, 'utf8');
						return {
							contents: compiler.transform(source, file)?.code ?? source,
							loader: file.endsWith('.tsrx') ? 'js' : 'ts',
							resolveDir: path.dirname(file),
						};
					});
				},
			},
		],
	});
	return import(pathToFileURL(outfile).href);
}

// Fragment the actual renderer output before server.ts reads it. The first
// fragment deliberately ends inside markup, JSON, or a multibyte character.
function fragment(stream, firstBoundary) {
	const reader = stream.getReader();
	let remainder;
	let first = true;
	let index = 0;
	return new ReadableStream({
		async pull(controller) {
			if (remainder === undefined || remainder.length === 0) {
				const next = await reader.read();
				if (next.done) {
					controller.close();
					return;
				}
				remainder = Buffer.from(next.value);
			}
			const size = first ? firstBoundary(remainder) : [1, 2, 13, 5, 29][index++ % 5];
			assert.ok(size > 0 && size < (first ? remainder.length : Infinity));
			first = false;
			controller.enqueue(remainder.subarray(0, size));
			remainder = remainder.subarray(size);
		},
		cancel(reason) {
			return reader.cancel(reason);
		},
	});
}

function inside(bytes, marker, offset) {
	const start = bytes.indexOf(marker);
	assert.notEqual(start, -1, `Renderer output must include ${marker}`);
	return start + offset;
}

test(
	'launcher follows complete shell and signal authority before held authorization ends',
	{ timeout: 20_000 },
	async (t) => {
		const server = await buildServer(t);
		for (const [name, boundary] of [
			['renderer chunks', null],
			['split opening tag', () => 1],
			['split native seed JSON', (bytes) => inside(bytes, '"from server"', 5)],
			['split selection JSON', (bytes) => inside(bytes, '"documentId"', 5)],
			['split UTF-8', (bytes) => inside(bytes, '…', 1)],
		]) {
			await t.test(name, { timeout: 4_000 }, async (t) => {
				server.setTransport((stream) => (boundary === null ? stream : fragment(stream, boundary)));
				const run = 'launcher-' + name.replaceAll(/[^a-z]/gi, '-');
				const abort = new AbortController();
				const url = 'https://fixture.test/?run=' + run;
				const request = new Request(url, {
					signal: abort.signal,
					headers: {
						'x-conversation-bench': JSON.stringify({
							run,
							holdAuth: true,
							latency: 'none',
							bodyCount: 1,
							historyCount: 1,
						}),
					},
				});
				let reader;
				t.after(async () => {
					abort.abort();
					await reader?.cancel().catch(() => {});
				});
				reader = (await server.render(request, '/behavior.js')).getReader();
				const decoder = new TextDecoder('utf-8', { fatal: true });
				let html = '';
				const append = ({ value, done }) => {
					if (!done) html += decoder.decode(value, { stream: true });
					return done;
				};
				const launcher = '<script>import("/behavior.js")';
				while (
					!html.includes(launcher) ||
					!html.slice(html.indexOf(launcher)).includes('</script>')
				) {
					assert.equal(append(await reader.read()), false, 'Launcher must arrive before EOF');
				}
				const prefix = html.slice(0, html.indexOf('<script id="behavior-identity"'));
				assert.ok(prefix.includes('</main>'), 'Launcher must follow the complete shell');
				assert.ok(prefix.includes('Loading conversation…'), 'Split UTF-8 must remain intact');
				const scripts = [...prefix.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
				const native = scripts.find(([_, attributes]) =>
					attributes.includes('data-octane-native-signals'),
				);
				assert.ok(native, 'Native signal seeds must arrive before the launcher');
				const manifest = JSON.parse(native[2]);
				assert.ok(
					JSON.stringify(manifest).includes('from server'),
					'Native seed value must be intact',
				);
				for (const [, attributes, source] of scripts) {
					if (!attributes.includes('application/json')) new Script(source);
				}
				assert.ok(
					scripts.some(([, , source]) => source.includes('"documentId":' + JSON.stringify(run))),
					'Automatic query selection authority must arrive before the launcher',
				);
				assert.deepEqual(
					JSON.parse(html.match(/id="behavior-identity"[^>]*>([\s\S]*?)<\/script>/)[1]),
					{ buildId: 'behavior-benchmark-v1', documentId: run },
				);
				const trace = await server.diagnostics(new Request(url)).json();
				const events = trace.requests.flatMap((item) => item.events.map((entry) => entry.event));
				assert.ok(events.includes('auth:held'));
				assert.ok(!events.includes('body:start') && !events.includes('history:start'));
				assert.ok(!html.includes('Private answer') && !html.includes('</body></html>'));
				const pending = reader.read();
				assert.equal(await Promise.race([pending.then(() => 'read'), delay(20, 'held')]), 'held');
				assert.deepEqual(
					await server
						.diagnostics(new Request(url.replace('/?', '/release?'), { method: 'POST' }))
						.json(),
					{ run, released: 1 },
				);
				let done = append(await pending);
				while (!done) done = append(await reader.read());
				html += decoder.decode();
				assert.ok(html.includes('Private answer 1.') && html.includes('Private conversation 1'));
				assert.ok(html.endsWith('</body></html>'));
				assert.equal(html.split(launcher).length - 1, 1, 'Exactly one launcher per response');
				assert.equal(html.split('id="behavior-identity"').length - 1, 1);
			});
		}
	},
);
