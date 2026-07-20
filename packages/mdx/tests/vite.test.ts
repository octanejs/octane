/**
 * Vite plugin claiming rules — which module ids `octaneMdx()` transforms.
 * `.md` is default-ON (docs sites want plain markdown compiled like `.mdx`),
 * with two escape hatches: `md: false` leaves ALL `.md` modules alone, and
 * asset-query imports (`?raw`, `?url`, `?inline`) always pass through
 * untouched — vite's asset plugin owns those (its load step already produced
 * `export default "<file text>"`; re-compiling that JS would mangle it).
 */
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { octaneMdx } from '@octanejs/mdx/vite';
import { octane } from 'octane/compiler/vite';

function plugin(options?: Parameters<typeof octaneMdx>[0]) {
	const p = octaneMdx(options);
	p.configResolved({ command: 'build' });
	return p;
}

const transform = (p: ReturnType<typeof octaneMdx>, code: string, id: string) =>
	p.transform.call({}, code, id);

describe('octaneMdx() id claiming', () => {
	it('transforms .mdx and .md modules (md default-on)', async () => {
		const p = plugin();
		expect(await transform(p, '# hi\n', '/docs/doc.mdx')).not.toBeNull();
		expect(await transform(p, '# hi\n', '/docs/doc.md')).not.toBeNull();
		expect(await transform(p, 'const x = 1;', '/src/mod.ts')).toBeNull();
	});

	it('md: false leaves .md modules alone', async () => {
		const p = plugin({ md: false });
		expect(await transform(p, '# hi\n', '/docs/doc.md')).toBeNull();
		expect(await transform(p, '# hi\n', '/docs/doc.mdx')).not.toBeNull();
	});

	it('passes ?raw / ?url / ?inline asset imports through untouched', async () => {
		const p = plugin();
		// vite's asset plugin already loaded these as JS — not markdown source.
		const assetJs = 'export default "# hi\\n";';
		expect(await transform(p, assetJs, '/docs/doc.md?raw')).toBeNull();
		expect(await transform(p, assetJs, '/docs/doc.mdx?raw')).toBeNull();
		expect(await transform(p, assetJs, '/docs/doc.md?url')).toBeNull();
		expect(await transform(p, assetJs, '/docs/doc.md?inline')).toBeNull();
	});

	it('still transforms ids carrying vite-internal bookkeeping queries', async () => {
		const p = plugin();
		expect(await transform(p, '# hi\n', '/docs/doc.md?v=abc123')).not.toBeNull();
		expect(await transform(p, '# hi\n', '/docs/doc.mdx?import&v=abc123')).not.toBeNull();
	});

	it('publishes one authored-range warning per module generation', async () => {
		const p = plugin();
		const warn = vi.fn();
		const source = '# Form\n\n<input onChange={() => {}} />\n';
		const context = { warn };
		const first = await p.transform.call(context, source, '/docs/form.mdx');
		expect(first?.diagnostics).toHaveLength(1);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith(
			expect.objectContaining({
				code: 'OCTANE_NATIVE_TEXT_ONCHANGE',
				id: '/docs/form.mdx',
				loc: { file: '/docs/form.mdx', line: 3, column: 7 },
			}),
		);

		await p.transform.call(context, source, '/docs/form.mdx', { ssr: true });
		expect(warn).toHaveBeenCalledTimes(1);

		p.watchChange('/docs/form.mdx');
		await p.transform.call(context, source, '/docs/form.mdx');
		expect(warn).toHaveBeenCalledTimes(2);
	});

	it('watches existing state-model inputs without importing missing manifests', async () => {
		const p = octaneMdx();
		const resolveStateModelForSource = vi.fn(() => ({
			stateModel: 'permissive' as const,
			dependencies: ['/repo/package.json'],
			missingDependencies: ['/repo/docs/package.json'],
		}));
		p.configResolved({
			command: 'build',
			root: '/repo',
			plugins: [{ name: 'octane', api: { octane: { resolveStateModelForSource } } }],
		});
		const addWatchFile = vi.fn();

		await p.transform.call({ addWatchFile }, '# Doc\n', '/repo/docs/Doc.mdx');

		expect(resolveStateModelForSource).toHaveBeenCalledWith('/repo/docs/Doc.mdx');
		expect(addWatchFile.mock.calls).toEqual([['/repo/package.json']]);
	});

	it('uses the dev watcher instead of transform imports while serving', async () => {
		const p = octaneMdx();
		const resolveStateModelForSource = vi.fn(() => ({
			stateModel: 'permissive' as const,
			dependencies: ['/repo/package.json'],
			missingDependencies: ['/repo/docs/package.json'],
		}));
		p.configResolved({
			command: 'serve',
			root: '/repo',
			plugins: [{ name: 'octane', api: { octane: { resolveStateModelForSource } } }],
		});
		const watch = vi.fn();
		p.configureServer({ watcher: { add: watch } });
		const addWatchFile = vi.fn();

		await p.transform.call({ addWatchFile }, '# Doc\n', '/repo/docs/Doc.mdx');

		expect(watch).toHaveBeenCalledWith(['/repo/package.json', '/repo/docs/package.json']);
		expect(addWatchFile).not.toHaveBeenCalled();
		const restart = vi.fn(async () => undefined);
		expect(
			await p.hotUpdate.handler.call(
				{ environment: { name: 'client' } },
				{ file: '/repo/package.json', server: { restart } },
			),
		).toBeUndefined();
		expect(restart).not.toHaveBeenCalled();
	});

	it('restarts standalone MDX when a watched policy input changes', async () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-mdx-state-model-hmr-'));
		try {
			const manifest = join(root, 'package.json');
			const document = join(root, 'docs/Doc.mdx');
			mkdirSync(join(root, 'docs'), { recursive: true });
			writeFileSync(manifest, JSON.stringify({ name: 'docs-app', private: true }));
			const p = octaneMdx();
			p.configResolved({ command: 'serve', root });
			const watch = vi.fn();
			p.configureServer({ watcher: { add: watch } });
			await p.transform.call({}, '# Doc\n', document);
			const restart = vi.fn(async () => undefined);

			const update = await p.hotUpdate.handler.call(
				{ environment: { name: 'client' } },
				{ file: manifest, server: { restart } },
			);

			expect(update).toEqual([]);
			expect(restart).toHaveBeenCalledOnce();
			expect(watch.mock.calls.flat(2)).toContain(manifest);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('re-publishes causal warnings when a watched policy input changes through a symlink', async () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-mdx-policy-watch-'));
		try {
			const policyRoot = join(root, 'policy');
			const policyAlias = join(root, 'policy-alias');
			mkdirSync(policyRoot);
			symlinkSync(policyRoot, policyAlias, 'dir');
			const policyManifest = join(policyRoot, 'package.json');
			writeFileSync(policyManifest, '{}');
			const watchedPolicyManifest = join(policyAlias, 'package.json');
			let stateModel: 'causal' | 'permissive' = 'causal';
			const p = octaneMdx();
			p.configResolved({
				command: 'build',
				root,
				plugins: [
					{
						name: 'octane',
						api: {
							octane: {
								resolveStateModelForSource: () => ({
									stateModel,
									dependencies: [policyManifest],
									missingDependencies: [],
								}),
							},
						},
					},
				],
			});
			const warn = vi.fn();
			const context = { warn, addWatchFile: vi.fn() };
			const source = `import { useEffect, useState } from 'octane'

export function Report() {
  const [, setCount] = useState(0)
  useEffect(() => setCount(1), [])
  return <span />
}

<Report />
`;
			const document = join(root, 'docs/Report.mdx');

			await p.transform.call(context, source, document);
			expect(warn).toHaveBeenCalledTimes(1);

			stateModel = 'permissive';
			p.watchChange(watchedPolicyManifest);
			await p.transform.call(context, source, document);
			expect(warn).toHaveBeenCalledTimes(1);

			stateModel = 'causal';
			p.watchChange(watchedPolicyManifest);
			await p.transform.call(context, source, document);
			expect(warn).toHaveBeenCalledTimes(2);
			expect(warn).toHaveBeenLastCalledWith(
				expect.objectContaining({
					code: 'OCTANE_CAUSAL_STATE_EFFECT_WRITE',
					id: document,
				}),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('uses the core compiler state-model resolver for app and dependency documents', async () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-mdx-state-model-'));
		try {
			const appDocument = join(root, 'docs/App.mdx');
			mkdirSync(join(root, 'docs'), { recursive: true });
			writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'app', private: true }));

			const dependencyRoot = join(root, 'node_modules/@vendor/legacy-docs');
			const dependencyDocument = join(dependencyRoot, 'Guide.mdx');
			mkdirSync(dependencyRoot, { recursive: true });
			const dependencyManifest = join(dependencyRoot, 'package.json');
			writeFileSync(
				dependencyManifest,
				JSON.stringify({
					name: '@vendor/legacy-docs',
					peerDependencies: { octane: '*' },
					octane: { stateModel: 'permissive' },
				}),
			);

			const compiler = octane({
				hmr: false,
				stateModel: {
					default: 'causal',
					packages: { '@vendor/legacy-docs': 'permissive' },
				},
			});
			await (compiler.config as (config: { root: string }) => unknown)({ root });

			const p = octaneMdx();
			p.configResolved({ command: 'build', root, plugins: [compiler] });
			const watchFiles: string[] = [];
			const context = { addWatchFile: (file: string) => watchFiles.push(file) };
			const app = await p.transform.call(context, '# App\n', appDocument);
			const dependency = await p.transform.call(context, '# Legacy\n', dependencyDocument);

			expect(app?.code).toContain('markStateModel');
			expect(dependency?.code).not.toContain('markStateModel');
			expect(watchFiles).toContain(dependencyManifest);

			const unapprovedCompiler = octane({
				hmr: false,
				stateModel: { default: 'causal' },
			});
			await (unapprovedCompiler.config as (config: { root: string }) => unknown)({ root });
			const unapprovedMdx = octaneMdx();
			unapprovedMdx.configResolved({
				command: 'build',
				root,
				plugins: [unapprovedCompiler],
			});
			await expect(
				unapprovedMdx.transform.call({}, '# Legacy\n', dependencyDocument),
			).rejects.toThrow(/permissive dependency code requires consumer approval/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
