import { describe, expect, it, vi } from 'vitest';
import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOctaneCompiler } from '../src/compiler/bundler.js';
import { normalizeStateModelConfig } from '../src/compiler/state-model.js';
import { octane as createVitePlugin } from '../src/compiler/vite.js';

const COMPONENT = `export function View() @{ <p>{'ready'}</p> }\n`;

function writeManifest(root: string, value: object) {
	mkdirSync(root, { recursive: true });
	const manifest = join(root, 'package.json');
	writeFileSync(manifest, JSON.stringify(value));
	return manifest;
}

function writeDependency(root: string, name: string, stateModel?: string) {
	const packageRoot = join(root, 'node_modules', ...name.split('/'));
	const manifest = writeManifest(packageRoot, {
		name,
		peerDependencies: { octane: '*' },
		...(stateModel === undefined ? null : { octane: { stateModel } }),
	});
	const source = join(packageRoot, 'src/View.tsrx');
	mkdirSync(join(packageRoot, 'src'), { recursive: true });
	writeFileSync(source, COMPONENT);
	return { manifest, source };
}

describe('state-model package boundaries', () => {
	it('canonicalizes equivalent direct compiler configuration', () => {
		const first = normalizeStateModelConfig({
			default: 'causal',
			packages: { zed: 'permissive', '@scope/alpha': 'causal' },
		});
		const second = normalizeStateModelConfig({
			packages: { '@scope/alpha': 'causal', zed: 'permissive' },
			default: 'causal',
		});
		expect(first.signature).toBe(second.signature);
		expect(Object.keys(first.packages)).toEqual(['@scope/alpha', 'zed']);
	});

	it('rejects an application package entry instead of silently ignoring it', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-state-model-app-'));
		try {
			writeManifest(root, { name: 'state-model-app', private: true });
			const compiler = createOctaneCompiler({
				root,
				stateModel: {
					default: 'causal',
					packages: { 'state-model-app': 'permissive' },
				},
			});
			expect(() => compiler.discoverSourceDependencies()).toThrow(
				/cannot select the application package "state-model-app".*use compiler\.stateModel\.default/,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('validates Vite package policy against config.root rather than process.cwd()', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-state-model-vite-root-'));
		try {
			writeManifest(root, { name: 'real-vite-app', private: true });
			const cwdManifest = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
				name: string;
			};
			const plugin = createVitePlugin({
				hmr: false,
				stateModel: { packages: { [cwdManifest.name]: 'permissive' } },
			});

			expect(() => plugin.config({ root })).not.toThrow();

			const invalidPlugin = createVitePlugin({
				hmr: false,
				stateModel: { packages: { 'real-vite-app': 'permissive' } },
			});
			expect(() => invalidPlugin.config({ root })).toThrow(
				/OCTANE_APPLICATION_STATE_MODEL_OVERRIDE|cannot select the application package/,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('uses canonical manifest identity for a symlinked application root', () => {
		const fixtureRoot = mkdtempSync(join(tmpdir(), 'octane-state-model-symlink-root-'));
		try {
			const realRoot = join(fixtureRoot, 'real-app');
			const linkedRoot = join(fixtureRoot, 'linked-app');
			writeManifest(realRoot, {
				name: 'state-model-app',
				private: true,
				octane: { stateModel: 'permissive' },
			});
			const source = join(realRoot, 'src/App.tsrx');
			mkdirSync(join(realRoot, 'src'), { recursive: true });
			writeFileSync(source, COMPONENT);
			symlinkSync(realRoot, linkedRoot, 'dir');

			const compiler = createOctaneCompiler({
				root: linkedRoot,
				stateModel: { default: 'causal' },
			});
			expect(compiler.transform(COMPONENT, source)?.stateModel).toBe('causal');
		} finally {
			rmSync(fixtureRoot, { recursive: true, force: true });
		}
	});

	it('keeps sibling source in the application package when the bundler root is a subdirectory', () => {
		const packageRoot = mkdtempSync(join(tmpdir(), 'octane-state-model-subroot-'));
		try {
			writeManifest(packageRoot, {
				name: 'state-model-app',
				private: true,
				octane: { stateModel: 'permissive' },
			});
			const bundlerRoot = join(packageRoot, 'web');
			const siblingSource = join(packageRoot, 'shared/View.tsrx');
			mkdirSync(bundlerRoot, { recursive: true });
			mkdirSync(join(packageRoot, 'shared'), { recursive: true });
			writeFileSync(siblingSource, COMPONENT);

			const compiler = createOctaneCompiler({
				root: bundlerRoot,
				stateModel: { default: 'causal' },
			});
			expect(compiler.transform(COMPONENT, siblingSource)?.stateModel).toBe('causal');
		} finally {
			rmSync(packageRoot, { recursive: true, force: true });
		}
	});

	it('treats a nested workspace manifest as a separate package boundary', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-state-model-workspace-'));
		try {
			writeManifest(root, { name: 'state-model-app', private: true });
			const packageRoot = join(root, 'packages', 'legacy-widgets');
			writeManifest(packageRoot, {
				name: '@workspace/legacy-widgets',
				peerDependencies: { octane: '*' },
				octane: { stateModel: 'permissive' },
			});
			const source = join(packageRoot, 'View.tsrx');
			writeFileSync(source, COMPONENT);
			const unapproved = createOctaneCompiler({
				root,
				stateModel: { default: 'causal' },
			});
			expect(() => unapproved.transform(COMPONENT, source)).toThrow(
				/permissive dependency code requires consumer approval/,
			);

			const approved = createOctaneCompiler({
				root,
				stateModel: {
					default: 'causal',
					packages: { '@workspace/legacy-widgets': 'permissive' },
				},
			});
			expect(approved.transform(COMPONENT, source)?.stateModel).toBe('permissive');
			expect(approved.transform(COMPONENT, join(root, 'src/App.tsrx'))?.stateModel).toBe('causal');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('accepts causal declarations and applies the same model to client and server', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-state-model-causal-'));
		try {
			writeManifest(root, { name: 'app', private: true });
			const dependency = writeDependency(root, '@vendor/causal-widgets', 'causal');
			const compiler = createOctaneCompiler({ root, stateModel: { default: 'permissive' } });
			const client = compiler.transform(COMPONENT, dependency.source, { environment: 'client' });
			const server = compiler.transform(COMPONENT, dependency.source, { environment: 'server' });
			expect(client?.stateModel).toBe('causal');
			expect(server?.stateModel).toBe('causal');
			expect(client?.dependencies).toContain(dependency.manifest);
			expect(server?.dependencies).toContain(dependency.manifest);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('exposes the same per-file classification and watch metadata to adjacent compilers', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-state-model-adjacent-'));
		try {
			writeManifest(root, { name: 'app', private: true });
			const dependency = writeDependency(root, '@vendor/causal-docs', 'causal');
			const compiler = createOctaneCompiler({ root });
			const resolution = compiler.resolveStateModelForSource(dependency.source);
			expect(resolution).toMatchObject({
				stateModel: 'causal',
				dependencies: expect.arrayContaining([dependency.manifest, join(root, 'package.json')]),
			});
			expect(resolution.missingDependencies).toEqual([
				join(root, 'node_modules', '@vendor', 'causal-docs', 'src', 'package.json'),
			]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('discovers raw-source packages that expose only named subpaths', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-state-model-subpath-discovery-'));
		try {
			writeManifest(root, {
				name: 'app',
				private: true,
				dependencies: { '@vendor/subpath-widgets': '1.0.0' },
			});
			const packageRoot = join(root, 'node_modules/@vendor/subpath-widgets');
			const manifest = writeManifest(packageRoot, {
				name: '@vendor/subpath-widgets',
				exports: { './widget': './src/widget.js' },
				peerDependencies: { octane: '*' },
			});
			mkdirSync(join(packageRoot, 'src'), { recursive: true });
			writeFileSync(join(packageRoot, 'src/widget.js'), `export const widget = true;\n`);

			const discovery = createOctaneCompiler({ root }).discoverSourceDependencies();
			expect(discovery.packages).toEqual(['@vendor/subpath-widgets']);
			expect(discovery.dependencies).toContain(realpathSync(manifest));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('requires exact consumer approval for a permissive package declaration', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-state-model-approval-'));
		try {
			writeManifest(root, { name: 'app', private: true });
			const dependency = writeDependency(root, '@vendor/legacy-widgets', 'permissive');
			const unapproved = createOctaneCompiler({ root });
			expect(() => unapproved.transform(COMPONENT, dependency.source)).toThrow(
				/consumer approval.*compiler: \{ stateModel: \{ packages: \{ "@vendor\/legacy-widgets": "permissive"/,
			);

			const approved = createOctaneCompiler({
				root,
				stateModel: {
					packages: { '@vendor/legacy-widgets': 'permissive' },
				},
			});
			expect(approved.transform(COMPONENT, dependency.source)?.stateModel).toBe('permissive');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('lets a consumer classify an undeclared dependency without changing the app model', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-state-model-undeclared-'));
		try {
			writeManifest(root, { name: 'app', private: true });
			const dependency = writeDependency(root, 'unmarked-widgets');
			const compiler = createOctaneCompiler({
				root,
				stateModel: {
					default: 'causal',
					packages: { 'unmarked-widgets': 'permissive' },
				},
			});
			expect(compiler.transform(COMPONENT, dependency.source)?.stateModel).toBe('permissive');
			expect(compiler.transform(COMPONENT, join(root, 'src/App.tsrx'))?.stateModel).toBe('causal');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('refreshes package declarations only after the watched manifest is invalidated', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-state-model-invalidate-'));
		try {
			writeManifest(root, { name: 'app', private: true });
			const dependency = writeDependency(root, 'changing-widgets', 'causal');
			const compiler = createOctaneCompiler({ root });
			expect(compiler.transform(COMPONENT, dependency.source)?.stateModel).toBe('causal');

			writeFileSync(
				dependency.manifest,
				JSON.stringify({
					name: 'changing-widgets',
					peerDependencies: { octane: '*' },
					octane: { stateModel: 'permissive' },
				}),
			);
			// The cached decision is stable for the current watch generation.
			expect(compiler.transform(COMPONENT, dependency.source)?.stateModel).toBe('causal');
			compiler.invalidate(dependency.manifest);
			expect(() => compiler.transform(COMPONENT, dependency.source)).toThrow(
				/OCTANE_PERMISSIVE_PACKAGE_APPROVAL_REQUIRED|permissive dependency code requires consumer approval/,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('restarts direct Vite integration when a watched package changes state model', async () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-state-model-vite-hmr-'));
		try {
			writeManifest(root, { name: 'app', private: true });
			const dependency = writeDependency(root, '@vendor/changing-widgets');
			const plugin = createVitePlugin({ hmr: false });
			plugin.config({ root });
			const addWatchFile = vi.fn();
			const transform = plugin.transform as (code: string, id: string) => { code: string };
			const first = transform.call({ addWatchFile }, COMPONENT, dependency.source);
			expect(first.code).not.toContain('markStateModel');
			expect(addWatchFile).toHaveBeenCalledWith(dependency.manifest);

			writeManifest(join(root, 'node_modules/@vendor/changing-widgets'), {
				name: '@vendor/changing-widgets',
				peerDependencies: { octane: '*' },
				octane: { stateModel: 'causal' },
			});
			plugin.watchChange(dependency.manifest);
			const restart = vi.fn(async () => undefined);
			const hotUpdate = plugin.hotUpdate as {
				handler(context: unknown): Promise<unknown>;
			};
			const update = await hotUpdate.handler.call(
				{ environment: { name: 'client' } },
				{ file: dependency.manifest, modules: [], server: { restart } },
			);
			expect(update).toEqual([]);
			expect(restart).toHaveBeenCalledOnce();

			const second = transform.call({ addWatchFile }, COMPONENT, dependency.source);
			expect(second.code).toContain('markStateModel');

			const nearerManifest = join(root, 'node_modules/@vendor/changing-widgets/src/package.json');
			expect(addWatchFile).not.toHaveBeenCalledWith(nearerManifest);
			writeManifest(join(root, 'node_modules/@vendor/changing-widgets/src'), {
				name: '@vendor/changing-widgets-source',
				peerDependencies: { octane: '*' },
				octane: { stateModel: 'causal' },
			});
			plugin.watchChange(nearerManifest);
			expect(
				await hotUpdate.handler.call(
					{ environment: { name: 'client' } },
					{ file: nearerManifest, modules: [], server: { restart } },
				),
			).toEqual([]);
			expect(restart).toHaveBeenCalledTimes(2);

			const unrelated = join(root, 'unrelated/package.json');
			expect(
				await hotUpdate.handler.call(
					{ environment: { name: 'client' } },
					{ file: unrelated, modules: [], server: { restart } },
				),
			).toBeUndefined();
			expect(restart).toHaveBeenCalledTimes(2);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('registers serve-mode manifests without adding them as transform imports', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-state-model-vite-watch-'));
		try {
			writeManifest(root, { name: 'app', private: true });
			const dependency = writeDependency(root, '@vendor/watched-widgets');
			const plugin = createVitePlugin({ hmr: false });
			plugin.config({ root });
			(plugin.configResolved as (config: { command: string; root: string }) => void)({
				command: 'serve',
				root,
			});
			const watch = vi.fn();
			(plugin.configureServer as (server: { watcher: { add(files: string[]): void } }) => void)({
				watcher: { add: watch },
			});
			const addWatchFile = vi.fn();
			const transform = plugin.transform as (code: string, id: string) => { code: string };

			transform.call({ addWatchFile }, COMPONENT, dependency.source);

			expect(watch).toHaveBeenCalledOnce();
			expect(watch.mock.calls[0][0]).toEqual(
				expect.arrayContaining([
					dependency.manifest,
					join(root, 'package.json'),
					join(root, 'node_modules/@vendor/watched-widgets/src/package.json'),
				]),
			);
			expect(addWatchFile).not.toHaveBeenCalled();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('does not silently label manually slotted source as causal output', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-state-model-manual-'));
		try {
			writeManifest(root, { name: 'app', private: true });
			const packageRoot = join(root, 'node_modules', 'manual-widgets');
			writeManifest(packageRoot, {
				name: 'manual-widgets',
				peerDependencies: { octane: '*' },
				octane: { hookSlots: { manual: ['src'] }, stateModel: 'causal' },
			});
			const source = join(packageRoot, 'src/hooks.js');
			mkdirSync(join(packageRoot, 'src'), { recursive: true });
			const code = `import { useState } from 'octane';\nexport const useValue = () => useState(0, 1);\n`;
			writeFileSync(source, code);
			const compiler = createOctaneCompiler({ root });
			expect(() => compiler.transform(code, source)).toThrow(
				/cannot emit the causal-state provenance ABI/,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('stamps causal plain-source custom hooks without a direct octane import', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-state-model-plain-source-'));
		try {
			writeManifest(root, { name: 'app', private: true });
			const source = join(root, 'src/useBridge.ts');
			mkdirSync(join(root, 'src'), { recursive: true });
			const code = `export function useBridge(setValue) { setValue(1); }\n`;
			writeFileSync(source, code);

			const permissive = createOctaneCompiler({ root });
			expect(permissive.transform(code, source)).toBeNull();

			const causal = createOctaneCompiler({ root, stateModel: { default: 'causal' } });
			const result = causal.transform(code, source);
			expect(result).toMatchObject({ kind: 'slots', stateModel: 'causal' });
			expect(result?.code).toContain('useBridge = /* @__PURE__ */');
			expect(result?.code).toContain('markStateModel');

			const owned = createOctaneCompiler({
				root,
				requireDirective: true,
				stateModel: { default: 'causal' },
			});
			expect(owned.transform(code, source)).toBeNull();
			const marked = `/** @jsxImportSource octane */\n${code}`;
			expect(owned.transform(marked, source)).toMatchObject({
				kind: 'slots',
				stateModel: 'causal',
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('reserves octane-no-slot for permissive or host-owned modules', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-state-model-no-slot-'));
		try {
			writeManifest(root, { name: 'app', private: true });
			const source = join(root, 'src/useValue.ts');
			const code = `// octane-no-slot\nimport { useState } from 'octane';\nexport const useValue = () => useState(0);\n`;

			const permissive = createOctaneCompiler({ root });
			expect(permissive.transform(code, source)).toBeNull();

			const causal = createOctaneCompiler({ root, stateModel: { default: 'causal' } });
			let causalError = null;
			try {
				causal.transform(code, source);
			} catch (error) {
				causalError = error;
			}
			expect(causalError).toMatchObject({
				code: 'OCTANE_CAUSAL_NO_SLOT_UNSUPPORTED',
				filename: '/src/useValue.ts',
			});
			expect(String(causalError)).toMatch(/Remove the opt-out and let Octane slot the file/);

			const noImportSource = join(root, 'src/useBridge.ts');
			const noImportCode = `// octane-no-slot\nexport function useBridge(setValue) { setValue(1); }\n`;
			expect(() => causal.transform(noImportCode, noImportSource)).toThrow(
				/cannot emit the causal-state provenance ABI/,
			);

			const hostOwned = createOctaneCompiler({
				root,
				requireDirective: true,
				stateModel: { default: 'causal' },
			});
			expect(hostOwned.transform(code, source)).toBeNull();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('does not let exclude strip causal provenance from Octane-owned plain helpers', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-state-model-exclude-'));
		try {
			writeManifest(root, { name: 'app', private: true });
			const source = join(root, 'src/useValue.ts');
			const code = `import { useState } from 'octane';\nexport const useValue = () => useState(0);\n`;
			const noImportSource = join(root, 'src/useBridge.ts');
			const noImportCode = `export function useBridge(setValue) { setValue(1); }\n`;
			const typeOnlySource = join(root, 'src/types.ts');
			const typeOnlyCode = `import type { StateModel } from 'octane';\nexport type Model = StateModel;\n`;
			const unusedImportSource = join(root, 'src/constants.ts');
			const unusedImportCode = `import { useState } from 'octane';\nexport const value = 1;\n`;
			const excluded = createOctaneCompiler({
				root,
				exclude: ['/src/'],
				stateModel: { default: 'causal' },
			});

			for (const [excludedCode, excludedSource, filename] of [
				[code, source, '/src/useValue.ts'],
				[noImportCode, noImportSource, '/src/useBridge.ts'],
			]) {
				let excludedError = null;
				try {
					excluded.transform(excludedCode, excludedSource);
				} catch (error) {
					excludedError = error;
				}
				expect(excludedError).toMatchObject({
					code: 'OCTANE_CAUSAL_EXCLUDE_UNSUPPORTED',
					filename,
				});
				expect(String(excludedError)).toMatch(/Remove the exclusion and let Octane slot the file/);
			}

			// A direct import is not itself proof that the file needs provenance.
			expect(excluded.transform(typeOnlyCode, typeOnlySource)).toBeNull();
			expect(excluded.transform(unusedImportCode, unusedImportSource)).toBeNull();

			const excludedPermissive = createOctaneCompiler({ root, exclude: ['/src/'] });
			expect(excludedPermissive.transform(code, source)).toBeNull();

			const hostOwned = createOctaneCompiler({
				root,
				exclude: ['/src/'],
				requireDirective: true,
				stateModel: { default: 'causal' },
			});
			expect(hostOwned.transform(code, source)).toBeNull();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
