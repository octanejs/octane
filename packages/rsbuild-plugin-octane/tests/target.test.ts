import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRsbuild } from '@rsbuild/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pluginOctane } from '../src/index.js';

const repositoryRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

function write(root: string, relativePath: string, content: string) {
	const file = join(root, relativePath);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
}

function link(root: string, packageName: string, target: string) {
	const destination = join(root, 'node_modules', ...packageName.split('/'));
	mkdirSync(dirname(destination), { recursive: true });
	symlinkSync(target, destination, 'dir');
}

function readJavaScript(directory: string): string {
	return readdirSync(directory, { withFileTypes: true })
		.flatMap((entry) => {
			const file = join(directory, entry.name);
			return entry.isDirectory()
				? readJavaScript(file)
				: /\.m?js$/.test(entry.name)
					? readFileSync(file, 'utf8')
					: '';
		})
		.join('\n');
}

function writeApp(
	root: string,
	target: string,
	serverTarget?: 'webworker' | 'cloudflare',
	minify?: boolean,
) {
	write(root, 'package.json', JSON.stringify({ private: true, type: 'module' }) + '\n');
	write(
		root,
		'tsconfig.json',
		JSON.stringify({ compilerOptions: { allowJs: true, moduleResolution: 'Bundler' } }) + '\n',
	);
	write(
		root,
		'index.html',
		'<head><!--ssr-head--></head><body><div id="root"><!--ssr-body--></div></body>\n',
	);
	write(root, 'src/Page.tsrx', 'export function Page() @{ <main>target</main> }\n');
	write(
		root,
		'octane.config.ts',
		`${serverTarget === 'cloudflare' ? "import { cloudflare } from '@octanejs/adapter-cloudflare';\n" : ''}import { defineConfig, RenderRoute } from '@octanejs/rsbuild-plugin';
export default defineConfig({
	build: { target: ${target}${minify === undefined ? '' : `, minify: ${minify}`} },
	${
		serverTarget === 'cloudflare'
			? 'adapter: cloudflare(),'
			: serverTarget
				? `adapter: {
		name: 'fixture-webworker',
		serverTarget: 'webworker',
		runtime: {
			hash: () => '00000000',
			createAsyncContext: () => ({ run: (_store, fn) => fn(), getStore: () => undefined }),
		},
	},`
				: ''
	}
	router: { routes: [new RenderRoute({ path: '/', entry: '/src/Page.tsrx' })] },
});
`,
	);
	link(root, 'octane', join(repositoryRoot, 'packages/octane'));
	link(root, '@octanejs/rsbuild-plugin', join(repositoryRoot, 'packages/rsbuild-plugin-octane'));
	if (serverTarget === 'cloudflare') {
		link(root, '@octanejs/adapter-cloudflare', join(repositoryRoot, 'packages/adapter-cloudflare'));
	}
}

describe('Rsbuild build.target mapping', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'octane-rsbuild-target-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('applies an ES target to both client/server Rspack runtimes and only preserves generated import.meta', async () => {
		writeApp(root, JSON.stringify('es5'));
		const instance = await createRsbuild({
			cwd: root,
			rsbuildConfig: { plugins: [pluginOctane({ hmr: false })] },
		});
		const configs = await instance.initConfigs({ action: 'build' });

		expect(configs.map((config) => config.target)).toEqual(
			expect.arrayContaining([
				['web', 'es5'],
				['node', 'es5'],
			]),
		);
		const serverConfig = configs.find((config) =>
			Array.isArray(config.target) ? config.target.includes('node') : config.target === 'node',
		)!;
		expect(serverConfig.module?.parser?.javascript?.importMeta).not.toBe(false);
		expect(serverConfig.module?.rules).toEqual(
			expect.arrayContaining([expect.objectContaining({ parser: { importMeta: false } })]),
		);
		await instance.build();
	});

	it('converts esbuild-style browser targets for SWC and Rspack runtime generation', async () => {
		writeApp(root, JSON.stringify(['chrome100', 'firefox100']));
		const instance = await createRsbuild({
			cwd: root,
			rsbuildConfig: { plugins: [pluginOctane({ hmr: false })] },
		});
		const inspected = await instance.inspectConfig();

		expect(inspected.origin.environmentConfigs.web.output.overrideBrowserslist).toEqual([
			'chrome >= 100',
			'firefox >= 100',
		]);
		expect(inspected.origin.bundlerConfigs.map((config) => config.target)).toEqual(
			expect.arrayContaining([
				['web', 'browserslist:chrome >= 100,firefox >= 100'],
				['node', 'browserslist:chrome >= 100,firefox >= 100'],
			]),
		);
	});

	it('maps build.target=false without dropping the false-valued configuration', async () => {
		writeApp(root, 'false');
		const instance = await createRsbuild({
			cwd: root,
			rsbuildConfig: { plugins: [pluginOctane({ hmr: false })] },
		});
		const configs = await instance.initConfigs({ action: 'build' });

		expect(configs.map((config) => config.target)).toEqual(
			expect.arrayContaining([
				['web', 'es2024'],
				['node', 'es2024'],
			]),
		);
	});

	it('emits an importable Cloudflare Worker entry only in production', async () => {
		writeApp(root, JSON.stringify('es2022'), 'cloudflare');
		const production = await createRsbuild({
			cwd: root,
			rsbuildConfig: { plugins: [pluginOctane({ hmr: false })] },
		});
		const productionConfigs = await production.initConfigs({ action: 'build' });
		const workerConfig = productionConfigs.find((config) =>
			Array.isArray(config.target)
				? config.target.includes('webworker')
				: config.target === 'webworker',
		)!;

		expect(production.getNormalizedConfig({ environment: 'node' }).output.target).toBe(
			'web-worker',
		);
		expect(workerConfig.target).toEqual(['webworker', 'es2022']);
		expect((workerConfig.experiments as { outputModule?: boolean })?.outputModule).toBe(true);
		expect(workerConfig.output?.module).toBe(true);
		expect(workerConfig.output?.chunkFilename).toBe('chunks/[name].js');
		expect(workerConfig.output?.library).toEqual({ type: 'module' });
		expect(workerConfig.externalsType).toBe('module');
		expect(workerConfig.optimization?.minimize).toBe(true);

		await production.build();
		const entryFile = join(root, 'dist/server/entry.js');
		expect(existsSync(entryFile)).toBe(true);
		expect(existsSync(join(root, 'dist/server/worker.js'))).toBe(true);
		const worker = (await import(`${pathToFileURL(entryFile).href}?test=${Date.now()}`)) as {
			createWebWorkerHandler?: unknown;
		};
		expect(worker.createWebWorkerHandler).toBeTypeOf('function');

		const development = await createRsbuild({
			cwd: root,
			rsbuildConfig: { plugins: [pluginOctane({ hmr: false })] },
		});
		const developmentConfigs = await development.initConfigs({ action: 'dev' });
		expect(development.getNormalizedConfig({ environment: 'node' }).output.target).toBe('node');
		expect(
			developmentConfigs.some((config) =>
				Array.isArray(config.target) ? config.target.includes('node') : config.target === 'node',
			),
		).toBe(true);
	}, 120_000);

	it.each([true, false])('maps build.minify=%s to webworker optimization', async (minify) => {
		writeApp(root, JSON.stringify('es2022'), 'webworker', minify);
		const instance = await createRsbuild({
			cwd: root,
			rsbuildConfig: { plugins: [pluginOctane({ hmr: false })] },
		});
		const configs = await instance.initConfigs({ action: 'build' });
		const workerConfig = configs.find((config) =>
			Array.isArray(config.target)
				? config.target.includes('webworker')
				: config.target === 'webworker',
		)!;
		expect(workerConfig.optimization?.minimize).toBe(minify);
	});

	it('emits profiling only in the client production bundle', async () => {
		writeApp(root, JSON.stringify('es2022'));
		const instance = await createRsbuild({
			cwd: root,
			rsbuildConfig: { plugins: [pluginOctane({ hmr: false, profile: true })] },
		});
		await instance.build();

		const client = readJavaScript(join(root, 'dist/client'));
		const server = readJavaScript(join(root, 'dist/server'));
		for (const marker of ['__OCTANE_PROFILER__', 'octane.component', '/src/Page.tsrx#Page']) {
			expect(client).toContain(marker);
			expect(server).not.toContain(marker);
		}
	});

	it.each([
		['build', 'production'],
		['dev', 'development'],
	] as const)(
		'defines the Octane mode for browser output and production Node output for %s',
		async (action, mode) => {
			writeApp(root, JSON.stringify('es2022'));
			const instance = await createRsbuild({
				cwd: root,
				rsbuildConfig: { plugins: [pluginOctane({ hmr: false })] },
			});
			await instance.initConfigs({ action });

			expect(
				instance.getNormalizedConfig({ environment: 'web' }).source.define['process.env.NODE_ENV'],
			).toBe(JSON.stringify(mode));
			const nodeDefine = instance.getNormalizedConfig({ environment: 'node' }).source.define;
			if (action === 'build') {
				expect(nodeDefine['process.env.NODE_ENV']).toBe(JSON.stringify('production'));
			} else {
				expect(nodeDefine).not.toHaveProperty('process.env.NODE_ENV');
			}
		},
	);

	it('rejects ambiguous mixed ES and browser target arrays', async () => {
		writeApp(root, JSON.stringify(['es2018', 'chrome100']));
		const instance = await createRsbuild({
			cwd: root,
			rsbuildConfig: { plugins: [pluginOctane({ hmr: false })] },
		});
		await expect(instance.initConfigs({ action: 'build' })).rejects.toThrow(
			'cannot mix ES levels and browser targets',
		);
	});

	it('rejects app routing beneath an unsupported Rsbuild base', async () => {
		writeApp(root, JSON.stringify('es2022'));
		const instance = await createRsbuild({
			cwd: root,
			rsbuildConfig: {
				plugins: [pluginOctane({ hmr: false })],
				server: { base: '/docs' },
			},
		});
		await expect(instance.initConfigs({ action: 'build' })).rejects.toThrow(
			'currently requires server.base to be "/"',
		);
	});
});
