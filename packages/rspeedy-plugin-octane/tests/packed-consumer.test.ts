import { execFileSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

import {
	decode_napi as decodeNativeBundleWithNapi,
	decode_wasm as decodeNativeBundleWithWasm,
	supportNapi,
} from '@lynx-js/tasm';
import { describe, expect, it } from 'vitest';

const WORKSPACE_ROOT = resolve(import.meta.dirname, '../../..');
const APPLICATION_FIXTURE = resolve(import.meta.dirname, '_fixtures/application');
const PACKAGES = {
	octane: resolve(WORKSPACE_ROOT, 'packages/octane'),
	'@octanejs/lynx': resolve(WORKSPACE_ROOT, 'packages/lynx'),
	'@octanejs/rspack-plugin': resolve(WORKSPACE_ROOT, 'packages/rspack-plugin-octane'),
	'@octanejs/rspeedy-plugin': resolve(WORKSPACE_ROOT, 'packages/rspeedy-plugin-octane'),
} as const;

function nativeScriptText(script: unknown): string {
	if (typeof script === 'string') return script;
	if (Array.isArray(script)) {
		if (script.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
			return Buffer.from(script).toString('latin1');
		}
		return script.map(nativeScriptText).join('\n');
	}
	if (script !== null && typeof script === 'object') {
		return Object.values(script).map(nativeScriptText).join('\n');
	}
	return '';
}

function isWithin(directory: string, target: string): boolean {
	const path = relative(directory, target);
	return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function packWorkspacePackages(root: string): Record<keyof typeof PACKAGES, string> {
	return Object.fromEntries(
		Object.entries(PACKAGES).map(([name, directory]) => {
			const destination = join(root, name.replaceAll('/', '-').replaceAll('@', ''));
			mkdirSync(destination, { recursive: true });
			execFileSync('pnpm', ['--dir', directory, 'pack', '--pack-destination', destination], {
				cwd: WORKSPACE_ROOT,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
				timeout: 120_000,
			});
			const archives = readdirSync(destination).filter((entry) => entry.endsWith('.tgz'));
			expect(archives, `${name} should produce one package archive`).toHaveLength(1);
			return [name, join(destination, archives[0])];
		}),
	) as Record<keyof typeof PACKAGES, string>;
}

function renderOverrides(archives: Record<keyof typeof PACKAGES, string>): string {
	return `overrides:\n${Object.entries(archives)
		.map(([name, archive]) => `  ${JSON.stringify(name)}: ${JSON.stringify(`file:${archive}`)}`)
		.join('\n')}\n`;
}

async function decodeNativeBundle(content: Buffer): Promise<Record<string, unknown>> {
	return supportNapi()
		? decodeNativeBundleWithNapi(content)
		: await decodeNativeBundleWithWasm(content);
}

describe('@octanejs/rspeedy-plugin packed consumer', () => {
	it('builds a native bundle from installed package archives outside the workspace', async () => {
		const temporaryRoot = mkdtempSync(join(tmpdir(), 'octane-rspeedy-packed-'));
		const consumerRoot = join(temporaryRoot, 'consumer');
		const outputRoot = join(consumerRoot, 'dist');
		const developmentOutputRoot = join(consumerRoot, 'dist-development');
		try {
			const archives = packWorkspacePackages(join(temporaryRoot, 'archives'));
			mkdirSync(consumerRoot, { recursive: true });
			cpSync(join(APPLICATION_FIXTURE, 'src'), join(consumerRoot, 'src'), { recursive: true });
			const archiveSpecs = Object.fromEntries(
				Object.entries(archives).map(([name, archive]) => [name, `file:${archive}`]),
			);
			writeFileSync(
				join(consumerRoot, 'package.json'),
				`${JSON.stringify(
					{
						name: 'octane-rspeedy-packed-consumer',
						private: true,
						type: 'module',
						dependencies: {
							'@lynx-js/rspeedy': '0.16.0',
							'@octanejs/lynx': archiveSpecs['@octanejs/lynx'],
							'@octanejs/rspack-plugin': archiveSpecs['@octanejs/rspack-plugin'],
							'@octanejs/rspeedy-plugin': archiveSpecs['@octanejs/rspeedy-plugin'],
							'@rsbuild/core': '2.1.4',
							'@rspack/core': '2.1.3',
							octane: archiveSpecs.octane,
						},
					},
					null,
					2,
				)}\n`,
				'utf8',
			);
			writeFileSync(join(consumerRoot, 'pnpm-workspace.yaml'), renderOverrides(archives), 'utf8');
			writeFileSync(
				join(consumerRoot, 'build.mjs'),
				`import { createRspeedy } from '@lynx-js/rspeedy';
import { pluginOctane } from '@octanejs/rspeedy-plugin';

const mode = process.argv[2] ?? 'production';
const outputRoot = process.argv[3] ?? ${JSON.stringify(outputRoot)};
const rspeedy = await createRspeedy({
  cwd: ${JSON.stringify(consumerRoot)},
  loadEnv: false,
  environment: ['lynx'],
  rspeedyConfig: {
    mode,
    environments: { lynx: {} },
    dev: { hmr: mode === 'development', liveReload: mode === 'development' },
    output: {
      cleanDistPath: true,
      dataUriLimit: 0,
      distPath: { root: outputRoot },
      filenameHash: false,
      sourceMap: false,
    },
    source: { entry: { main: './src/background.ts' } },
    splitChunks: false,
    plugins: [pluginOctane({ hmr: mode === 'development', dev: mode === 'development' })],
  },
});
let result;
try {
  result = await rspeedy.build();
} finally {
  await result?.close();
}
`,
				'utf8',
			);

			execFileSync(
				'pnpm',
				[
					'install',
					'--prefer-offline',
					'--ignore-scripts',
					'--no-frozen-lockfile',
					'--config.auto-install-peers=false',
				],
				{
					cwd: consumerRoot,
					encoding: 'utf8',
					env: { ...process.env, CI: '1' },
					stdio: ['ignore', 'pipe', 'pipe'],
					timeout: 120_000,
				},
			);

			const consumerRequire = createRequire(join(consumerRoot, 'package.json'));
			for (const packageName of Object.keys(PACKAGES)) {
				const installed = realpathSync(consumerRequire.resolve(packageName));
				expect(
					existsSync(join(consumerRoot, 'node_modules', ...packageName.split('/'))),
					`${packageName} should be installed for the consumer`,
				).toBe(true);
				expect(
					isWithin(WORKSPACE_ROOT, installed),
					`${packageName} must not resolve to source`,
				).toBe(false);
			}
			const virtualStore = join(consumerRoot, 'node_modules/.pnpm');
			expect(
				readdirSync(virtualStore).some((entry) => /^(?:react|react-dom|preact)@/.test(entry)),
			).toBe(false);

			execFileSync(process.execPath, ['build.mjs'], {
				cwd: consumerRoot,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
				timeout: 120_000,
			});
			const bundlePath = join(outputRoot, 'main.lynx.bundle');
			expect(existsSync(bundlePath)).toBe(true);
			const decoded = await decodeNativeBundle(readFileSync(bundlePath));
			const mainThread = nativeScriptText(decoded['main-thread-script']);
			const background = nativeScriptText(decoded['background-thread-script']);
			expect(decoded['engine-version']).toBe('3.9');
			expect(mainThread).toMatch(/getJSContext/);
			expect(background).toMatch(/getCoreContext/);
			expect(background).toContain('milestone-five');
			expect(readdirSync(join(outputRoot, 'static/svg'))).toContain('badge.svg');

			execFileSync(process.execPath, ['build.mjs', 'development', developmentOutputRoot], {
				cwd: consumerRoot,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
				timeout: 120_000,
			});
			expect(existsSync(join(developmentOutputRoot, 'main.lynx.bundle'))).toBe(true);
		} finally {
			rmSync(temporaryRoot, { recursive: true, force: true });
		}
	}, 240_000);
});
