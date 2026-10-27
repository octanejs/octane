// Playground version selection — the `version` query contract, the npm release
// list, and how a published release becomes a compiler plus sandbox runtime.
// Network is stubbed; the real esm.sh + npm path is covered by the browser run.
import { afterEach, describe, expect, it } from 'vitest';
import {
	MAIN_VERSION,
	esmUrl,
	fetchReleases,
	loadReleaseToolchain,
	parseVersionParam,
} from '../src/lib/playground-version.ts';
import {
	MAIN_COMPILER,
	compilePlayground,
	compileTypes,
	setPlaygroundCompiler,
} from '../src/lib/playground.ts';
import { buildModuleGraph, peekCompiledFile } from '../src/lib/playground-modules.ts';

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});

function stubFetch(routes: Record<string, () => Response>) {
	const calls: string[] = [];
	const fetcher = (async (input: RequestInfo | URL) => {
		const url = String(input);
		calls.push(url);
		const route = routes[url];
		if (!route) throw new Error(`unexpected fetch ${url}`);
		return route();
	}) as typeof fetch;
	return { fetcher, calls };
}

afterEach(() => setPlaygroundCompiler(MAIN_COMPILER));

describe('version query parameter', () => {
	it('defaults to main when absent or explicit', () => {
		for (const value of [undefined, null, '', 'main']) {
			expect(parseVersionParam(value)).toEqual({ ok: true, version: MAIN_VERSION });
		}
	});

	it('accepts an exact published release, with or without a leading v', () => {
		expect(parseVersionParam('0.2.7')).toEqual({ ok: true, version: '0.2.7' });
		expect(parseVersionParam('v0.16.0')).toEqual({ ok: true, version: '0.16.0' });
		expect(parseVersionParam('1.0.0-beta.1')).toEqual({ ok: true, version: '1.0.0-beta.1' });
	});

	it('rejects ranges, tags, and revisions with an actionable message', () => {
		for (const value of ['latest', '^0.16.0', '0.16', 1021, 'commit:abc1234']) {
			const parsed = parseVersionParam(value);
			expect(parsed.ok).toBe(false);
			if (!parsed.ok) expect(parsed.error).toContain('Use main or an exact published release');
		}
	});
});

describe('release list', () => {
	it('lists non-deprecated releases newest first', async () => {
		const { fetcher } = stubFetch({
			'https://registry.npmjs.org/octane': () =>
				json({
					versions: {
						// The npm name predates Octane; those releases are deprecated.
						'1.0.0': { deprecated: 'unrelated package' },
						'0.2.7': {},
						'0.16.0': {},
						'0.16.0-next.1': {},
						'0.10.2': {},
					},
				}),
		});
		expect(await fetchReleases(fetcher)).toEqual(['0.16.0', '0.16.0-next.1', '0.10.2', '0.2.7']);
	});

	it('reports a registry failure', async () => {
		const { fetcher } = stubFetch({
			'https://registry.npmjs.org/octane': () => json({}, 503),
		});
		await expect(fetchReleases(fetcher)).rejects.toThrow('HTTP 503');
	});
});

describe('published release toolchain', () => {
	const exportsFor = (...subpaths: string[]) =>
		Object.fromEntries(subpaths.map((subpath) => [subpath, './dist/x.js']));

	it('loads the compiler and pins every runtime entry to the same esm.sh release', async () => {
		const { fetcher } = stubFetch({
			'https://registry.npmjs.org/octane/0.16.0': () =>
				json({
					exports: exportsFor(
						'.',
						'./compiler',
						'./compiler/volar',
						'./internal/client',
						'./react',
						'./signals',
						'./signals/client',
					),
				}),
		});
		const imported: string[] = [];
		const compile = () => ({ code: '', diagnostics: [] });
		const compileTypesInspection = () => ({});
		const toolchain = await loadReleaseToolchain('0.16.0', fetcher, async (url) => {
			imported.push(url);
			return url.includes('/compiler/volar') ? { compileTypesInspection } : { compile };
		});
		expect(imported).toEqual([esmUrl('0.16.0', '/compiler'), esmUrl('0.16.0', '/compiler/volar')]);
		expect(toolchain.compiler.compile).toBe(compile);
		expect(toolchain.compiler.compileTypesInspection).toBe(compileTypesInspection);
		expect(toolchain.runtime).toEqual({
			kind: 'esm',
			imports: {
				octane: 'https://esm.sh/octane@0.16.0?external=react,react-dom',
				'octane/internal/client':
					'https://esm.sh/octane@0.16.0/internal/client?external=react,react-dom',
				'octane/react': 'https://esm.sh/octane@0.16.0/react?external=react,react-dom',
				'octane/signals': 'https://esm.sh/octane@0.16.0/signals?external=react,react-dom',
				'octane/signals/client':
					'https://esm.sh/octane@0.16.0/signals/client?external=react,react-dom',
			},
		});
	});

	it('maps only the entries an older release ships', async () => {
		const { fetcher } = stubFetch({
			'https://registry.npmjs.org/octane/0.1.1': () =>
				json({ exports: exportsFor('.', './compiler', './server') }),
		});
		const toolchain = await loadReleaseToolchain('0.1.1', fetcher, async () => ({
			compile: () => ({}),
		}));
		expect(toolchain.compiler.compileTypesInspection).toBeUndefined();
		expect(toolchain.runtime).toEqual({
			kind: 'esm',
			imports: { octane: esmUrl('0.1.1') },
		});
	});

	it('rejects unpublished releases, releases without a compiler, and esm.sh failures', async () => {
		const { fetcher } = stubFetch({
			'https://registry.npmjs.org/octane/9.9.9': () => json({ error: 'not found' }, 404),
			'https://registry.npmjs.org/octane/1.0.0': () => json({ deprecated: 'unrelated' }),
			'https://registry.npmjs.org/octane/0.16.0': () =>
				json({ exports: exportsFor('.', './compiler') }),
		});
		const unused = async () => {
			throw new Error('should not import');
		};
		await expect(loadReleaseToolchain('9.9.9', fetcher, unused)).rejects.toThrow(
			'octane@9.9.9 is not published on npm.',
		);
		await expect(loadReleaseToolchain('1.0.0', fetcher, unused)).rejects.toThrow(
			'octane@1.0.0 does not ship the TSRX compiler.',
		);
		await expect(
			loadReleaseToolchain('0.16.0', fetcher, async () => {
				throw new TypeError('Failed to fetch dynamically imported module');
			}),
		).rejects.toThrow(
			'Could not load the octane@0.16.0 compiler from esm.sh: Failed to fetch dynamically imported module',
		);
	});
});

describe('active compiler', () => {
	const SOURCE = `export default function App() @{ <p>{'hi'}</p> }`;

	it('routes every compile through the selected compiler and recompiles on a switch', async () => {
		const files = [{ name: 'App.tsrx', source: SOURCE }];
		const main = await buildModuleGraph(files, 'App.tsrx');
		expect(main.ok).toBe(true);

		const seen: string[] = [];
		setPlaygroundCompiler({
			compile: ((source: string, filename: string) => {
				seen.push(filename);
				return { code: `export default function App() {}`, diagnostics: [] };
			}) as any,
		});
		const release = await buildModuleGraph(files, 'App.tsrx');
		expect(seen).toEqual(['App.tsrx']);
		expect(release.ok && release.modules[0].code).toBe('export default function App() {}');
		// The cached main compile is not served for the release compiler.
		expect(peekCompiledFile(files[0])).toEqual({
			ok: true,
			code: 'export default function App() {}',
			warnings: [],
		});
		expect(compilePlayground(SOURCE, 'App.tsrx')).toMatchObject({ ok: true });
		expect(compileTypes(SOURCE, 'App.tsrx')).toEqual({
			ok: false,
			error: 'This Octane version has no types inspection.',
		});
	});

	it('rejects runtime entries the selected release does not ship', async () => {
		const files = [
			{
				name: 'App.tsrx',
				source: `import { signal } from 'octane/signals';\nexport default function App() @{ <p>{String(signal)}</p> }`,
			},
		];
		const graph = await buildModuleGraph(files, 'App.tsrx', ['octane', 'octane/internal/client']);
		expect(graph).toEqual({
			ok: false,
			error: 'App.tsrx: "octane/signals" is not shipped by the selected Octane version.',
		});
	});
});
