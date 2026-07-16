import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const fixtureRoot = resolve(import.meta.dirname, '../_fixtures/bundler-app');
const viteOutput = resolve(fixtureRoot, 'dist-vite');
const rsbuildOutput = resolve(fixtureRoot, 'dist-rsbuild');
const rspackOutput = resolve(fixtureRoot, 'dist-rspack');
const fixtureNodeModules = resolve(fixtureRoot, 'node_modules');
const buildHelper = resolve(import.meta.dirname, '_build-bundlers.mjs');
const buildEvidenceMarker = '__OCTANE_THREE_BUNDLER_EVIDENCE__';
const execFileAsync = promisify(execFile);

function listFiles(root: string, current = root): string[] {
	if (!existsSync(current)) return [];
	return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
		const file = resolve(current, entry.name);
		return entry.isDirectory() ? listFiles(root, file) : [file.slice(root.length + 1)];
	});
}

function readJavaScript(root: string): string {
	return listFiles(root)
		.filter((file) => /\.m?js$/.test(file))
		.map((file) => readFileSync(resolve(root, file), 'utf8'))
		.join('\n');
}

interface BundlerEvidence {
	buildInfo: {
		transformKind: string;
		clientReference: { moduleId: string; renderer: string };
	};
	hmrSelfAccept: boolean;
	rspackBundleHasScene: boolean;
}

function startStaticServer(root: string): Promise<Server> {
	const server = createServer((request, response) => {
		const url = new URL(request.url ?? '/', 'http://fixture.test');
		const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
		const file = resolve(root, `.${pathname}`);
		const fromRoot = relative(root, file);
		if (fromRoot.startsWith('..') || !existsSync(file) || !statSync(file).isFile()) {
			response.writeHead(404).end('Not found');
			return;
		}
		const contentTypes: Record<string, string> = {
			'.css': 'text/css',
			'.html': 'text/html; charset=utf-8',
			'.js': 'text/javascript',
		};
		response.writeHead(200, {
			'content-type': contentTypes[extname(file)] ?? 'application/octet-stream',
		});
		response.end(readFileSync(file));
	});
	return new Promise((resolveServer, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => resolveServer(server));
	});
}

let staticServer: Server | undefined;
let viteOrigin = '';
let bundlerEvidence: BundlerEvidence;

beforeAll(async () => {
	for (const output of [viteOutput, rsbuildOutput, rspackOutput]) {
		rmSync(output, { recursive: true, force: true });
	}

	const { stdout } = await execFileAsync(process.execPath, [buildHelper], {
		cwd: fixtureRoot,
		maxBuffer: 20 * 1024 * 1024,
	});
	const evidenceLine = stdout.split('\n').findLast((line) => line.startsWith(buildEvidenceMarker));
	if (evidenceLine === undefined) {
		throw new Error(`Bundler helper returned no evidence. Output:\n${stdout}`);
	}
	bundlerEvidence = JSON.parse(evidenceLine.slice(buildEvidenceMarker.length));

	staticServer = await startStaticServer(viteOutput);
	const address = staticServer.address();
	if (address === null || typeof address === 'string') {
		throw new Error('Static fixture server did not expose a TCP address.');
	}
	viteOrigin = `http://127.0.0.1:${address.port}`;
}, 180_000);

afterAll(async () => {
	await new Promise<void>((resolveClose, reject) => {
		if (staticServer === undefined) {
			resolveClose();
			return;
		}
		staticServer.close((error) => (error === undefined ? resolveClose() : reject(error)));
	});
	for (const output of [viteOutput, rsbuildOutput, rspackOutput]) {
		rmSync(output, { recursive: true, force: true });
	}
	rmSync(fixtureNodeModules, { recursive: true, force: true });
});

describe('Three Canvas bundler and browser integration', () => {
	it('builds the same authored scene with production Vite and Rsbuild', () => {
		const viteFiles = listFiles(viteOutput);
		const rsbuildFiles = listFiles(rsbuildOutput);
		const referenceId = 'octane-client-reference-v1:three:/src/Scene.three.tsrx';

		expect(viteFiles).toContain('index.html');
		expect(viteFiles.some((file) => /(?:^|\/)assets\/.*\.js$/.test(file))).toBe(true);
		expect(readJavaScript(viteOutput)).toContain('bundler-proof-cube');

		expect(rsbuildFiles).toContain('index.html');
		expect(rsbuildFiles.some((file) => /\.js$/.test(file))).toBe(true);
		expect(readJavaScript(rsbuildOutput)).toContain('bundler-proof-cube');

		for (const output of [viteOutput, rsbuildOutput]) {
			const manifest = JSON.parse(
				readFileSync(resolve(output, 'octane-client-references.json'), 'utf8'),
			);
			const reference = manifest.references[referenceId];
			expect(manifest.version).toBe(1);
			expect(reference).toMatchObject({
				moduleId: '/src/Scene.three.tsrx',
				renderer: 'three',
			});
			expect(reference.chunks.length).toBeGreaterThan(0);
			for (const chunk of reference.chunks) {
				expect(existsSync(resolve(output, chunk))).toBe(true);
			}
		}
	});

	it('compiles the Three scene as a self-accepting client module under raw Rspack HMR', () => {
		expect(bundlerEvidence.buildInfo).toMatchObject({
			transformKind: 'compile',
			clientReference: {
				moduleId: '/src/Scene.three.tsrx',
				renderer: 'three',
			},
		});
		expect(bundlerEvidence.hmrSelfAccept).toBe(true);
		expect(bundlerEvidence.rspackBundleHasScene).toBe(true);
	});

	it('renders one non-blank manual WebGL frame in Chromium', async () => {
		let browser: import('playwright').Browser | undefined;
		try {
			const { chromium } = await import('playwright');
			browser = await chromium.launch({
				headless: true,
				args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
			});
		} catch (error) {
			throw new Error(
				'[@octanejs/three browser] Chromium is required ' +
					'(run `pnpm exec playwright install chromium`): ' +
					(error instanceof Error ? error.message.split('\n')[0] : String(error)),
			);
		}

		const page = await browser.newPage({ viewport: { width: 128, height: 128 } });
		const errors: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
		try {
			await page.goto(viteOrigin, { waitUntil: 'load' });
			await page.waitForFunction(
				() =>
					(globalThis as typeof globalThis & { __octaneThreeSceneReady?: boolean })
						.__octaneThreeSceneReady === true,
			);
			await page.evaluate(
				() =>
					new Promise<void>((resolveFrame) =>
						requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())),
					),
			);

			const proof = await page.evaluate(() => {
				const fixture = globalThis as typeof globalThis & {
					__octaneThreeFrameCount?: number;
					__octaneThreeState?: {
						advance(timestamp: number): void;
						frameloop: string;
						scene: { children: Array<{ name: string }> };
						size: { width: number; height: number };
						viewport: { dpr: number };
					};
				};
				const state = fixture.__octaneThreeState;
				const canvas = document.querySelector('canvas');
				if (state === undefined || canvas === null) {
					throw new Error('The Three Canvas did not expose its configured scene.');
				}
				const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
				if (context === null) throw new Error('Chromium did not create a WebGL context.');

				const pixels = new Uint8Array(context.drawingBufferWidth * context.drawingBufferHeight * 4);
				context.readPixels(
					0,
					0,
					context.drawingBufferWidth,
					context.drawingBufferHeight,
					context.RGBA,
					context.UNSIGNED_BYTE,
					pixels,
				);
				let before = 0;
				for (let index = 3; index < pixels.length; index += 4) {
					if (pixels[index] !== 0) before++;
				}

				state.advance(1 / 60);
				context.finish();
				context.readPixels(
					0,
					0,
					context.drawingBufferWidth,
					context.drawingBufferHeight,
					context.RGBA,
					context.UNSIGNED_BYTE,
					pixels,
				);
				let after = 0;
				for (let index = 0; index < pixels.length; index += 4) {
					if (pixels[index] > 64 && pixels[index + 1] < 32 && pixels[index + 2] < 32) {
						after++;
					}
				}
				const center =
					4 *
					(Math.floor(context.drawingBufferHeight / 2) * context.drawingBufferWidth +
						Math.floor(context.drawingBufferWidth / 2));
				return {
					after,
					before,
					canvasHeight: canvas.height,
					canvasWidth: canvas.width,
					center: [...pixels.slice(center, center + 4)],
					dpr: state.viewport.dpr,
					frameCount: fixture.__octaneThreeFrameCount,
					frameloop: state.frameloop,
					glError: context.getError(),
					scene: state.scene.children.map((child) => child.name),
					size: state.size,
				};
			});

			expect(proof.before).toBe(0);
			expect(proof.after).toBeGreaterThan(0);
			expect(proof).toMatchObject({
				canvasHeight: 64,
				canvasWidth: 64,
				center: [255, 0, 0, 255],
				dpr: 1,
				frameCount: 1,
				frameloop: 'never',
				glError: 0,
				scene: ['bundler-proof-cube'],
				size: { width: 64, height: 64 },
			});
			expect(errors).toEqual([]);
		} finally {
			await page.close();
			await browser.close();
		}
	}, 60_000);

	it('delivers real offset pointer events and native capture through Canvas', async () => {
		let browser: import('playwright').Browser | undefined;
		try {
			const { chromium } = await import('playwright');
			browser = await chromium.launch({
				headless: true,
				args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'],
			});
		} catch (error) {
			throw new Error(
				'[@octanejs/three browser] Chromium is required ' +
					'(run `pnpm exec playwright install chromium`): ' +
					(error instanceof Error ? error.message.split('\n')[0] : String(error)),
			);
		}

		const page = await browser.newPage({ viewport: { width: 192, height: 160 } });
		const errors: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
		try {
			await page.goto(viteOrigin, { waitUntil: 'load' });
			await page.waitForFunction(
				() =>
					(globalThis as typeof globalThis & { __octaneThreeSceneReady?: boolean })
						.__octaneThreeSceneReady === true,
			);
			await page.evaluate(() => {
				const proof = globalThis as typeof globalThis & {
					__octaneThreeEventLog?: Array<Record<string, unknown>>;
					__octaneThreeState?: { advance(timestamp: number): void };
				};
				proof.__octaneThreeEventLog = [];
				proof.__octaneThreeState?.advance(1 / 60);
			});
			const bounds = await page.locator('canvas').boundingBox();
			if (bounds === null) throw new Error('Canvas had no browser bounds.');
			const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
			const outside = { x: bounds.x + bounds.width + 24, y: center.y };

			await page.mouse.move(center.x, center.y);
			await page.mouse.down();
			await page.mouse.move(outside.x, outside.y);
			const duringCapture = await page.evaluate(
				() =>
					(
						globalThis as typeof globalThis & {
							__octaneThreeEventLog?: Array<Record<string, unknown>>;
						}
					).__octaneThreeEventLog ?? [],
			);
			const downIndex = duringCapture.findIndex((entry) => entry.type === 'down');
			expect(downIndex).toBeGreaterThanOrEqual(0);
			expect(duringCapture.slice(downIndex + 1).some((entry) => entry.type === 'move')).toBe(true);
			expect(duringCapture.slice(downIndex + 1).some((entry) => entry.type === 'leave')).toBe(
				false,
			);
			const down = duringCapture[downIndex] as {
				object: string;
				eventObject: string;
				point: number[];
				pointer: number[];
			};
			expect(down).toMatchObject({
				object: 'bundler-proof-cube',
				eventObject: 'bundler-proof-cube',
			});
			expect(down.pointer[0]).toBeCloseTo(0, 1);
			expect(down.pointer[1]).toBeCloseTo(0, 1);
			expect(down.point[2]).toBeCloseTo(1, 1);

			await page.mouse.up();
			await page.mouse.move(center.x, center.y);
			await page.evaluate(() => {
				const proof = globalThis as typeof globalThis & {
					__octaneThreeEventLog?: Array<Record<string, unknown>>;
				};
				proof.__octaneThreeEventLog = [];
			});
			await page.mouse.move(outside.x, outside.y);
			const afterRelease = await page.evaluate(
				() =>
					(
						globalThis as typeof globalThis & {
							__octaneThreeEventLog?: Array<Record<string, unknown>>;
						}
					).__octaneThreeEventLog ?? [],
			);
			expect(afterRelease.map((entry) => entry.type)).toEqual(['out', 'leave']);

			await page.mouse.move(center.x, center.y);
			await page.mouse.click(center.x, center.y);
			const clickLog = await page.evaluate(
				() =>
					(
						globalThis as typeof globalThis & {
							__octaneThreeEventLog?: Array<Record<string, unknown>>;
						}
					).__octaneThreeEventLog ?? [],
			);
			expect(clickLog.some((entry) => entry.type === 'click')).toBe(true);

			await page.reload({ waitUntil: 'load' });
			await page.waitForFunction(
				() =>
					(globalThis as typeof globalThis & { __octaneThreeSceneReady?: boolean })
						.__octaneThreeSceneReady === true,
			);
			await page.evaluate(() => {
				const proof = globalThis as typeof globalThis & {
					__octaneThreeEventLog?: Array<Record<string, unknown>>;
					__octaneThreeReleaseOnUp?: boolean;
					__octaneThreeState?: { advance(timestamp: number): void };
				};
				proof.__octaneThreeEventLog = [];
				proof.__octaneThreeReleaseOnUp = false;
				proof.__octaneThreeState?.advance(1 / 60);
			});
			const implicitReleaseBounds = await page.locator('canvas').boundingBox();
			if (implicitReleaseBounds === null) {
				throw new Error('Implicit-release Canvas had no browser bounds.');
			}
			const implicitReleaseCenter = {
				x: implicitReleaseBounds.x + implicitReleaseBounds.width / 2,
				y: implicitReleaseBounds.y + implicitReleaseBounds.height / 2,
			};
			const implicitReleaseOutside = {
				x: implicitReleaseBounds.x + implicitReleaseBounds.width + 24,
				y: implicitReleaseCenter.y,
			};
			await page.mouse.move(implicitReleaseCenter.x, implicitReleaseCenter.y);
			await page.mouse.down();
			await page.mouse.move(implicitReleaseOutside.x, implicitReleaseOutside.y);
			await page.mouse.up();
			await page.evaluate(
				() =>
					new Promise<void>((resolveFrame) =>
						requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())),
					),
			);
			const implicitRelease = await page.evaluate(() => {
				const proof = globalThis as typeof globalThis & {
					__octaneThreeEventLog?: Array<Record<string, unknown>>;
					__octaneThreePointerId?: number;
					__octaneThreeState?: {
						internal: { capturedMap: Map<number, unknown> };
					};
				};
				const canvas = document.querySelector('canvas');
				const pointerId = proof.__octaneThreePointerId;
				return {
					captured:
						canvas !== null && pointerId !== undefined ? canvas.hasPointerCapture(pointerId) : true,
					capturedMapSize: proof.__octaneThreeState?.internal.capturedMap.size,
					upEvents: proof.__octaneThreeEventLog?.filter((entry) => entry.type === 'up').length ?? 0,
				};
			});
			expect(implicitRelease).toEqual({ captured: false, capturedMapSize: 0, upEvents: 1 });

			await page.reload({ waitUntil: 'load' });
			await page.waitForFunction(
				() =>
					(globalThis as typeof globalThis & { __octaneThreeSceneReady?: boolean })
						.__octaneThreeSceneReady === true,
			);
			await page.evaluate(() => {
				const proof = globalThis as typeof globalThis & {
					__octaneThreeEventLog?: Array<Record<string, unknown>>;
					__octaneThreeRemoveOnDown?: boolean;
					__octaneThreeState?: { advance(timestamp: number): void };
				};
				proof.__octaneThreeEventLog = [];
				proof.__octaneThreeRemoveOnDown = true;
				proof.__octaneThreeState?.advance(1 / 60);
			});
			const nextBounds = await page.locator('canvas').boundingBox();
			if (nextBounds === null) throw new Error('Reloaded Canvas had no browser bounds.');
			const nextCenter = {
				x: nextBounds.x + nextBounds.width / 2,
				y: nextBounds.y + nextBounds.height / 2,
			};
			await page.mouse.move(nextCenter.x, nextCenter.y);
			await page.mouse.down();
			const removedCapture = await page.evaluate(() => {
				const proof = globalThis as typeof globalThis & {
					__octaneThreeEventLog?: Array<Record<string, unknown>>;
					__octaneThreePointerId?: number;
					__octaneThreeState?: { scene: { getObjectByName(name: string): unknown } };
				};
				const canvas = document.querySelector('canvas');
				const pointerId = proof.__octaneThreePointerId;
				return {
					captured:
						canvas !== null && pointerId !== undefined ? canvas.hasPointerCapture(pointerId) : true,
					meshPresent:
						proof.__octaneThreeState?.scene.getObjectByName('bundler-proof-cube') !== undefined,
				};
			});
			expect(removedCapture).toEqual({ captured: false, meshPresent: false });
			await page.mouse.up();
			await page.mouse.click(nextCenter.x, nextCenter.y);
			const missLog = await page.evaluate(
				() =>
					(
						globalThis as typeof globalThis & {
							__octaneThreeEventLog?: Array<Record<string, unknown>>;
						}
					).__octaneThreeEventLog ?? [],
			);
			expect(missLog.some((entry) => entry.type === 'root-miss')).toBe(true);
			expect(errors).toEqual([]);
		} finally {
			await page.close();
			await browser.close();
		}
	}, 60_000);
});
