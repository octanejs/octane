// @vitest-environment node
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeServer } from '../../../app-core/src/server/node-http.js';

const fixtureRoot = resolve(import.meta.dirname, '../_fixtures/ssr-app');
const outputs = {
	vite: resolve(fixtureRoot, 'dist-vite'),
	rsbuild: resolve(fixtureRoot, 'dist-rsbuild'),
	rspackClient: resolve(fixtureRoot, 'dist-rspack-client'),
	rspackServer: resolve(fixtureRoot, 'dist-rspack-server'),
};
const fixtureNodeModules = resolve(fixtureRoot, 'node_modules');
const buildHelper = resolve(import.meta.dirname, '_build-ssr.mjs');
const buildEvidenceMarker = '__OCTANE_THREE_SSR_EVIDENCE__';
const clientReferenceId = 'octane-client-reference-v1:three:/src/Scene.three.tsrx';
const execFileAsync = promisify(execFile);

interface RawBuildEvidence {
	clientScene: {
		buildInfo: {
			transformKind: string;
			clientReference: { id: string; moduleId: string; renderer: string };
		};
		present: boolean;
	};
	clientSetupPresent: boolean;
	serverScene: {
		buildInfo: {
			transformKind: string;
			clientReference: { id: string; moduleId: string; renderer: string };
		} | null;
		present: boolean;
	};
	serverSetupPresent: boolean;
}

interface FixtureVariant {
	name: 'Vite' | 'Rsbuild';
	root: string;
	origin: string;
	server?: Server;
	serverSceneProof?: unknown;
	serverHtml: Record<string, string>;
}

const variants: FixtureVariant[] = [
	{ name: 'Vite', root: outputs.vite, origin: '', serverHtml: {} },
	{ name: 'Rsbuild', root: outputs.rsbuild, origin: '', serverHtml: {} },
];
let rawEvidence: RawBuildEvidence;

async function originOf(server: Server): Promise<string> {
	if (!server.listening) {
		await new Promise<void>((resolveListening, reject) => {
			server.once('error', reject);
			server.once('listening', resolveListening);
		});
	}
	const address = server.address();
	if (address === null || typeof address === 'string') {
		throw new Error('Three SSR fixture server did not expose a TCP address.');
	}
	return `http://127.0.0.1:${address.port}`;
}

beforeAll(async () => {
	for (const output of Object.values(outputs)) {
		rmSync(output, { recursive: true, force: true });
	}

	const { stdout } = await execFileAsync(process.execPath, [buildHelper], {
		cwd: fixtureRoot,
		maxBuffer: 40 * 1024 * 1024,
	});
	const evidenceLine = stdout.split('\n').findLast((line) => line.startsWith(buildEvidenceMarker));
	if (evidenceLine === undefined) {
		throw new Error(`Three SSR build helper returned no evidence. Output:\n${stdout}`);
	}
	rawEvidence = JSON.parse(evidenceLine.slice(buildEvidenceMarker.length)).raw;

	for (const [index, variant] of variants.entries()) {
		delete (globalThis as any).__octaneThreeSsrProof;
		const entry = pathToFileURL(resolve(variant.root, 'server/entry.js'));
		entry.searchParams.set('three-ssr-test', `${index}-${Date.now()}`);
		const built = (await import(entry.href)) as {
			handler: (request: Request) => Promise<Response>;
		};
		for (const pathname of ['/', '/pending', '/error']) {
			const response = await built.handler(new Request(`http://fixture.test${pathname}`));
			if (response.status !== 200) {
				throw new Error(`${variant.name} SSR returned ${response.status} for ${pathname}.`);
			}
			variant.serverHtml[pathname] = await response.text();
		}
		variant.serverSceneProof = (globalThis as any).__octaneThreeSsrProof;

		variant.server = createNodeServer(built.handler, {
			staticDir: resolve(variant.root, 'client'),
		}).listen(0);
		variant.origin = await originOf(variant.server);
	}
}, 300_000);

afterAll(async () => {
	for (const variant of variants) {
		await new Promise<void>((resolveClose, reject) => {
			if (variant.server === undefined) {
				resolveClose();
				return;
			}
			variant.server.close((error) => (error === undefined ? resolveClose() : reject(error)));
		});
	}
	for (const output of Object.values(outputs)) {
		rmSync(output, { recursive: true, force: true });
	}
	rmSync(fixtureNodeModules, { recursive: true, force: true });
}, 30_000);

describe('Three Canvas production SSR and hydration', () => {
	it('emits one stable client reference and omits authored scene work from every server graph', () => {
		for (const variant of variants) {
			const clientRoot = resolve(variant.root, 'client');
			const manifest = JSON.parse(
				readFileSync(resolve(clientRoot, 'octane-client-references.json'), 'utf8'),
			);
			const reference = manifest.references[clientReferenceId];
			expect(manifest.version, variant.name).toBe(1);
			expect(reference, variant.name).toEqual({
				moduleId: '/src/Scene.three.tsrx',
				renderer: 'three',
				chunks: [...reference.chunks].sort(),
			});
			expect(reference.chunks.length, variant.name).toBeGreaterThan(0);
			for (const chunk of reference.chunks) {
				expect(existsSync(resolve(clientRoot, chunk)), `${variant.name}: ${chunk}`).toBe(true);
			}
			expect(variant.serverSceneProof, variant.name).toBeUndefined();
		}

		const clientReference = rawEvidence.clientScene.buildInfo.clientReference;
		expect(rawEvidence.clientScene).toMatchObject({
			present: true,
			buildInfo: {
				transformKind: 'compile',
				clientReference: {
					id: clientReferenceId,
					moduleId: '/src/Scene.three.tsrx',
					renderer: 'three',
				},
			},
		});
		expect(rawEvidence.serverScene).toMatchObject({
			present: true,
			buildInfo: {
				transformKind: 'client-only-stub',
				clientReference,
			},
		});
		expect(rawEvidence).toMatchObject({
			clientSetupPresent: true,
			serverSetupPresent: false,
		});
	});

	it('streams the Canvas shell and native fallback without evaluating its scene', () => {
		for (const variant of variants) {
			for (const [pathname, mode] of [
				['/', 'ready'],
				['/pending', 'pending'],
				['/error', 'error'],
			] as const) {
				const html = variant.serverHtml[pathname];
				expect(html, `${variant.name}: ${pathname}`).toContain(`data-three-page="${mode}"`);
				expect(html, `${variant.name}: ${pathname}`).toContain('data-three-canvas-shell=""');
				expect(html, `${variant.name}: ${pathname}`).toMatch(
					/<canvas[^>]*>[\s\S]*?<span data-three-native-fallback="">WebGL unavailable<\/span>[\s\S]*?<\/canvas>/,
				);
				expect(html, `${variant.name}: ${pathname}`).not.toContain('hydrated-three-scene');
				expect(html, `${variant.name}: ${pathname}`).not.toContain('Loading Three scene');
				expect(html, `${variant.name}: ${pathname}`).not.toContain('hydrated Three scene failed');
			}
		}
	});

	it('hydrates one adopted Canvas/root/scene and tears it down in Vite and Rsbuild', async () => {
		let browser: import('playwright').Browser | undefined;
		try {
			const { chromium } = await import('playwright');
			browser = await chromium.launch({
				headless: true,
				args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
			});
		} catch (error) {
			throw new Error(
				'[@octanejs/three SSR] Chromium is required ' +
					'(run `pnpm exec playwright install chromium`): ' +
					(error instanceof Error ? error.message.split('\n')[0] : String(error)),
			);
		}

		try {
			for (const variant of variants) {
				const page = await browser.newPage({ viewport: { width: 96, height: 96 } });
				const errors: string[] = [];
				page.on('console', (message) => {
					if (message.type() === 'error') errors.push(message.text());
				});
				page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
				try {
					await page.goto(variant.origin + '/', { waitUntil: 'load' });
					try {
						await page.waitForFunction(() => {
							const proof = (globalThis as any).__octaneThreeSsrProof;
							return proof?.created >= 1 && proof?.sceneMounts >= 1;
						});
					} catch (error) {
						const state = await page.evaluate(() => {
							const proof = (globalThis as any).__octaneThreeSsrProof;
							return {
								created: proof?.created,
								moduleEvaluations: proof?.moduleEvaluations,
								sceneMounts: proof?.sceneMounts,
								shellCount: document.querySelectorAll('[data-three-canvas-shell]').length,
								text: document.body.textContent,
							};
						});
						throw new Error(
							`${variant.name} ready Canvas did not mount: ${JSON.stringify(state)}; errors: ${JSON.stringify(errors)}`,
							{ cause: error },
						);
					}
					const mounted = await page.evaluate(() => {
						const proof = (globalThis as any).__octaneThreeSsrProof;
						const shell = document.querySelector('[data-three-canvas-shell]');
						const canvas = shell?.querySelector('canvas') ?? null;
						const fallback = document.querySelector('[data-three-native-fallback]');
						return {
							adopted: {
								canvas: proof.preHydrate.canvas === canvas,
								fallback: proof.preHydrate.fallback === fallback,
								page: proof.preHydrate.page === document.querySelector('[data-three-page]'),
								root: proof.preHydrate.root === document.getElementById('root'),
								shell: proof.preHydrate.shell === shell,
							},
							canvasCount: document.querySelectorAll('[data-three-canvas-shell] canvas').length,
							created: proof.created,
							fallbackText: fallback?.textContent,
							moduleEvaluations: proof.moduleEvaluations,
							rootSceneIds: proof.rootSceneIds,
							scene: proof.state.scene.children.map((child: any) => child.name),
							sceneMounts: proof.sceneMounts,
							shellCount: document.querySelectorAll('[data-three-canvas-shell]').length,
							stateActive: proof.state.internal.active,
						};
					});

					expect(mounted, variant.name).toEqual({
						adopted: { canvas: true, fallback: true, page: true, root: true, shell: true },
						canvasCount: 1,
						created: 1,
						fallbackText: 'WebGL unavailable',
						moduleEvaluations: 1,
						rootSceneIds: [expect.any(String)],
						scene: ['hydrated-three-scene'],
						sceneMounts: 1,
						shellCount: 1,
						stateActive: true,
					});

					await page.getByRole('button', { name: 'Unmount Canvas' }).click();
					await page.waitForFunction(() => {
						const proof = (globalThis as any).__octaneThreeSsrProof;
						return proof?.sceneCleanups === 1 && proof?.disposals === 1;
					});
					const unmounted = await page.evaluate(() => {
						const proof = (globalThis as any).__octaneThreeSsrProof;
						return {
							created: proof.created,
							disposals: proof.disposals,
							sceneChildren: proof.state.scene.children.length,
							sceneCleanups: proof.sceneCleanups,
							shellCount: document.querySelectorAll('[data-three-canvas-shell]').length,
							stateActive: proof.state.internal.active,
						};
					});
					expect(unmounted, variant.name).toEqual({
						created: 1,
						disposals: 1,
						sceneChildren: 0,
						sceneCleanups: 1,
						shellCount: 0,
						stateActive: false,
					});
					expect(errors, `${variant.name} browser errors`).toEqual([]);
				} finally {
					await page.close();
				}
			}
		} finally {
			await browser.close();
		}
	}, 120_000);

	it('projects a client-only Three asset pending state and starts it once', async () => {
		let browser: import('playwright').Browser | undefined;
		try {
			const { chromium } = await import('playwright');
			browser = await chromium.launch({
				headless: true,
				args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
			});
		} catch (error) {
			throw new Error(
				'[@octanejs/three SSR] Chromium is required ' +
					'(run `pnpm exec playwright install chromium`): ' +
					(error instanceof Error ? error.message.split('\n')[0] : String(error)),
			);
		}

		const page = await browser.newPage({ viewport: { width: 96, height: 96 } });
		const errors: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
		try {
			await page.goto(variants[0].origin + '/pending', { waitUntil: 'load' });
			await page.locator('[data-three-pending]').waitFor();
			const pending = await page.evaluate(() => {
				const proof = (globalThis as any).__octaneThreeSsrProof;
				return {
					assetStarts: proof.assetStarts,
					moduleEvaluations: proof.moduleEvaluations,
					sceneMounts: proof.sceneMounts,
				};
			});
			expect(pending).toEqual({
				assetStarts: 1,
				moduleEvaluations: 1,
				sceneMounts: undefined,
			});
			await page.evaluate(() => (globalThis as any).__octaneThreeSsrProof.resolveAsset());

			await page.waitForFunction(() => {
				const proof = (globalThis as any).__octaneThreeSsrProof;
				return proof?.sceneMounts === 1 && !document.querySelector('[data-three-pending]');
			});
			const resolved = await page.evaluate(() => {
				const proof = (globalThis as any).__octaneThreeSsrProof;
				const shell = document.querySelector('[data-three-canvas-shell]');
				return {
					adoptedShell: proof.preHydrate.shell === shell,
					assetStarts: proof.assetStarts,
					created: proof.created,
					scene: proof.state.scene.children.map((child: any) => child.name),
					sceneMounts: proof.sceneMounts,
				};
			});
			expect(resolved).toEqual({
				adoptedShell: true,
				assetStarts: 1,
				created: 1,
				scene: ['hydrated-three-pending-ready'],
				sceneMounts: 1,
			});
			expect(errors).toEqual([]);
		} finally {
			await page.close();
			await browser.close();
		}
	}, 60_000);

	it('projects a client-only Three render error to the DOM owner', async () => {
		let browser: import('playwright').Browser | undefined;
		try {
			const { chromium } = await import('playwright');
			browser = await chromium.launch({
				headless: true,
				args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
			});
		} catch (error) {
			throw new Error(
				'[@octanejs/three SSR] Chromium is required ' +
					'(run `pnpm exec playwright install chromium`): ' +
					(error instanceof Error ? error.message.split('\n')[0] : String(error)),
			);
		}

		const page = await browser.newPage({ viewport: { width: 96, height: 96 } });
		const errors: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
		try {
			await page.goto(variants[0].origin + '/error', { waitUntil: 'load' });
			await expect
				.poll(() => page.locator('[data-three-error]').textContent())
				.toBe('hydrated Three scene failed');
			const proof = await page.evaluate(() => {
				const value = (globalThis as any).__octaneThreeSsrProof;
				return {
					assetStarts: value.assetStarts,
					moduleEvaluations: value.moduleEvaluations,
					sceneMounts: value.sceneMounts,
				};
			});
			expect(proof).toEqual({
				assetStarts: undefined,
				moduleEvaluations: 1,
				sceneMounts: undefined,
			});
			expect(errors).toEqual([]);
		} finally {
			await page.close();
			await browser.close();
		}
	}, 60_000);
});
