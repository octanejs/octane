// @vitest-environment node
import { execFile } from 'node:child_process';
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	statSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchBrowser, webglLaunchOptions } from '../../../../test-utils/playwright-browser.js';
import { requireDoomProof, type DoomProofDescriptor } from './_proof.js';

const stagingRoot = realpathSync(mkdtempSync(join(tmpdir(), 'octane-doom-playground-')));
const buildHelper = resolve(import.meta.dirname, '_build.mjs');
const buildMarker = '__OCTANE_DOOM_BUILD_EVIDENCE__';
const execFileAsync = promisify(execFile);
let clientRoot = '';
let serverEntry = '';
let origin = '';
let staticServer: Server | undefined;

const mimeTypes: Record<string, string> = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.svg': 'image/svg+xml',
};

function listFiles(root: string, current = root): string[] {
	if (!existsSync(current)) return [];
	return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
		const file = resolve(current, entry.name);
		return entry.isDirectory() ? listFiles(root, file) : [relative(root, file)];
	});
}

function startStaticServer(root: string): Promise<{ server: Server; origin: string }> {
	const server = createServer((request, response) => {
		const url = new URL(request.url ?? '/', 'http://fixture.test');
		const requested =
			url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
		const file = resolve(root, requested);
		const fromRoot = relative(root, file);
		if (
			fromRoot === '..' ||
			fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
		) {
			response.writeHead(403).end('Forbidden');
			return;
		}
		try {
			if (!statSync(file).isFile()) throw new Error('not a file');
			response.writeHead(200, {
				'content-type': mimeTypes[extname(file)] ?? 'application/octet-stream',
				'cache-control': 'no-store',
			});
			response.end(readFileSync(file));
		} catch {
			response.writeHead(404).end('Not found');
		}
	});
	return new Promise((resolveServer, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (address === null || typeof address === 'string') {
				reject(new Error('Doom production server exposed no TCP port.'));
				return;
			}
			resolveServer({ server, origin: `http://127.0.0.1:${address.port}` });
		});
	});
}

async function closeServer(server: Server | undefined): Promise<void> {
	if (server === undefined) return;
	await new Promise<void>((resolveClose, reject) =>
		server.close((error) => (error === undefined ? resolveClose() : reject(error))),
	);
}

beforeAll(async () => {
	const { stdout } = await execFileAsync(process.execPath, [buildHelper, stagingRoot, 'client'], {
		cwd: stagingRoot,
		maxBuffer: 64 * 1024 * 1024,
		env: { ...process.env, VITE_DOOM_PROOF: '1' },
	});
	const evidenceLine = stdout.split('\n').findLast((line) => line.startsWith(buildMarker));
	if (evidenceLine === undefined) throw new Error(`Doom build returned no evidence:\n${stdout}`);
	({ clientOut: clientRoot, serverEntry } = JSON.parse(evidenceLine.slice(buildMarker.length)));
	const started = await startStaticServer(clientRoot);
	staticServer = started.server;
	origin = started.origin;
}, 300_000);

afterAll(async () => {
	await closeServer(staticServer);
	rmSync(stagingRoot, { recursive: true, force: true });
}, 30_000);

function proofDescriptor(value: any): DoomProofDescriptor | null {
	if (value == null) return null;
	return {
		version: value.version,
		contract: value.contract,
		hasSnapshot: typeof value.getSnapshot === 'function',
		hasShell: typeof value.getShell === 'function',
	};
}

async function installDoomProofShims(page: {
	addInitScript: (script: () => void) => Promise<void>;
}): Promise<void> {
	await page.addInitScript(function installShims() {
		class ProofAudioContext {
			currentTime = 0;
			destination = {};
			resumeCalls = 0;
			createOscillator() {
				return {
					type: 'sine',
					frequency: { value: 0, setValueAtTime() {} },
					connect() {
						return this;
					},
					start() {},
					stop() {},
				};
			}
			createGain() {
				return {
					gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
					connect() {
						return this;
					},
				};
			}
			async resume() {
				this.resumeCalls++;
				(globalThis as any).__doomAudioResumeCalls =
					((globalThis as any).__doomAudioResumeCalls ?? 0) + 1;
			}
			async close() {
				(globalThis as any).__doomAudioCloseCalls =
					((globalThis as any).__doomAudioCloseCalls ?? 0) + 1;
			}
		}
		Object.defineProperty(globalThis, 'AudioContext', { value: ProofAudioContext });
		Object.defineProperty(document, 'pointerLockElement', {
			configurable: true,
			get: function pointerLockElement() {
				return (globalThis as any).__doomPointerLockElement ?? null;
			},
		});
		(HTMLElement.prototype as any).requestPointerLock = async function requestPointerLock() {
			if ((globalThis as any).__doomRejectPointerLock) {
				throw new Error('Proof pointer permission rejected.');
			}
			(globalThis as any).__doomPointerLockElement = this;
			document.dispatchEvent(new Event('pointerlockchange'));
		};
		(document as any).exitPointerLock = function exitPointerLock() {
			(globalThis as any).__doomPointerLockElement = null;
			document.dispatchEvent(new Event('pointerlockchange'));
		};
		document.addEventListener('keydown', function onEscapeUnlock(event) {
			if (event.code !== 'Escape' && event.key !== 'Escape') return;
			if ((globalThis as any).__doomPointerLockElement == null) return;
			(document as any).exitPointerLock();
		});
	});
}

async function enterDoomLevel(page: {
	goto: (url: string, options?: { waitUntil?: 'load' }) => Promise<unknown>;
	waitForSelector: (selector: string) => Promise<unknown>;
	click: (selector: string) => Promise<unknown>;
	evaluate: (fn: () => unknown) => Promise<any>;
}): Promise<void> {
	await page.waitForSelector('[data-doom-landing="ready"]');
	await expect
		.poll(async function proofReady() {
			return page.evaluate(function hasProof() {
				return Boolean((globalThis as any).__OCTANE_DOOM_PROOF__);
			});
		})
		.toBe(true);
	const descriptor = await page.evaluate(function readProofDescriptor() {
		const proof = (globalThis as any).__OCTANE_DOOM_PROOF__;
		return proof == null
			? null
			: {
					version: proof.version,
					contract: proof.contract,
					hasSnapshot: typeof proof.getSnapshot === 'function',
					hasShell: typeof proof.getShell === 'function',
				};
	});
	requireDoomProof(descriptor);
	const loading = page.waitForSelector('[data-doom-loading="true"]');
	await page.click('[data-doom-start="true"]');
	await loading;
	await page.waitForSelector('[data-doom-shell="playing"]');
	await expect
		.poll(async function pointerLocked() {
			const shell = await page.evaluate(function readShell() {
				return (globalThis as any).__OCTANE_DOOM_PROOF__.getShell();
			});
			return shell.pointerLocked === true;
		})
		.toBe(true);
}

async function readDoomSnapshot(page: {
	evaluate: (fn: () => unknown) => Promise<any>;
}): Promise<any> {
	return page.evaluate(function readSnapshot() {
		return (globalThis as any).__OCTANE_DOOM_PROOF__.getSnapshot();
	});
}

async function readDoomShell(page: {
	evaluate: (fn: () => unknown) => Promise<any>;
}): Promise<any> {
	return page.evaluate(function readShell() {
		return (globalThis as any).__OCTANE_DOOM_PROOF__.getShell();
	});
}

async function moveForward(page: Page, initialZ: number): Promise<any> {
	await page.keyboard.down('KeyW');
	try {
		await expect
			.poll(async function playerMoved() {
				return (await readDoomSnapshot(page)).player.z;
			})
			.toBeLessThan(initialZ);
		return await readDoomSnapshot(page);
	} finally {
		await page.keyboard.up('KeyW');
	}
}

describe('Doom production playground evidence', () => {
	it('builds hashed production assets and server-renders the landing state without browser globals', async () => {
		const files = listFiles(clientRoot);
		expect(files).toContain('index.html');
		expect(files.some((file) => /^assets\/.+-[A-Za-z0-9_-]{8,}\.js$/.test(file))).toBe(true);
		for (const asset of readFileSync(resolve(clientRoot, 'index.html'), 'utf8').matchAll(
			/(?:src|href)="([^"]+)"/g,
		)) {
			if (!asset[1].startsWith('/assets/')) continue;
			expect(existsSync(resolve(clientRoot, asset[1].slice(1))), asset[1]).toBe(true);
		}

		await execFileAsync(process.execPath, [buildHelper, stagingRoot, 'ssr'], {
			cwd: stagingRoot,
			maxBuffer: 64 * 1024 * 1024,
			env: { ...process.env, VITE_DOOM_PROOF: '1' },
		});
		const entry = pathToFileURL(serverEntry);
		entry.searchParams.set('doom-ssr-proof', String(Date.now()));
		const server = (await import(entry.href)) as { html: string };
		expect(server.html).toContain('data-doom-shell="landing"');
		expect(server.html).toContain('data-doom-landing="ready"');
		expect(server.html).toContain('ENTER THE LEVEL');
		expect(server.html).not.toContain('data-doom-level="active"');
	}, 30_000);

	it('fails closed when production proof instrumentation is absent or renamed', () => {
		expect(() => requireDoomProof(null)).toThrow(/instrumentation is missing/);
		expect(() =>
			requireDoomProof(
				proofDescriptor({
					version: 1,
					contract: 'renamed-doom-proof',
					getSnapshot() {},
					getShell() {},
				}),
			),
		).toThrow(/instrumentation is missing/);
	});

	it('plays through permissions, input, combat, rendering, retry, and repeated cleanup', async () => {
		const browser = await launchBrowser(webglLaunchOptions());
		const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
		const errors: string[] = [];
		const failedResponses: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(`console: ${message.text()}`);
		});
		page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
		page.on('requestfailed', (request) =>
			failedResponses.push(`${request.url()}: ${request.failure()?.errorText ?? 'failed'}`),
		);
		page.on('response', (response) => {
			if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
		});

		try {
			await page.addInitScript(() => {
				class ProofAudioContext {
					currentTime = 0;
					destination = {};
					resumeCalls = 0;
					createOscillator() {
						return {
							type: 'sine',
							frequency: { value: 0, setValueAtTime() {} },
							connect() {
								return this;
							},
							start() {},
							stop() {},
						};
					}
					createGain() {
						return {
							gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
							connect() {
								return this;
							},
						};
					}
					async resume() {
						this.resumeCalls++;
						(globalThis as any).__doomAudioResumeCalls =
							((globalThis as any).__doomAudioResumeCalls ?? 0) + 1;
					}
					async close() {
						(globalThis as any).__doomAudioCloseCalls =
							((globalThis as any).__doomAudioCloseCalls ?? 0) + 1;
					}
				}
				Object.defineProperty(globalThis, 'AudioContext', { value: ProofAudioContext });
				Object.defineProperty(document, 'pointerLockElement', {
					configurable: true,
					get: () => (globalThis as any).__doomPointerLockElement ?? null,
				});
				(HTMLElement.prototype as any).requestPointerLock = async function () {
					if ((globalThis as any).__doomRejectPointerLock) {
						throw new Error('Proof pointer permission rejected.');
					}
					(globalThis as any).__doomPointerLockElement = this;
					document.dispatchEvent(new Event('pointerlockchange'));
				};
				(document as any).exitPointerLock = () => {
					(globalThis as any).__doomPointerLockElement = null;
					document.dispatchEvent(new Event('pointerlockchange'));
				};
				document.addEventListener('keydown', (event) => {
					if (event.code !== 'Escape' && event.key !== 'Escape') return;
					if ((globalThis as any).__doomPointerLockElement == null) return;
					(document as any).exitPointerLock();
				});
			});

			await page.goto(`${origin}/#doom`, { waitUntil: 'load' });
			await page.waitForSelector('[data-doom-landing="ready"]');
			const descriptor = await page.evaluate(() => {
				const proof = (globalThis as any).__OCTANE_DOOM_PROOF__;
				return proof == null
					? null
					: {
							version: proof.version,
							contract: proof.contract,
							hasSnapshot: typeof proof.getSnapshot === 'function',
							hasShell: typeof proof.getShell === 'function',
						};
			});
			requireDoomProof(descriptor);

			const loading = page.waitForSelector('[data-doom-loading="true"]');
			await page.click('[data-doom-start="true"]');
			await loading;
			await page.waitForSelector('[data-doom-shell="playing"]');
			const started = await page.evaluate(() => ({
				shell: (globalThis as any).__OCTANE_DOOM_PROOF__.getShell(),
				snapshot: (globalThis as any).__OCTANE_DOOM_PROOF__.getSnapshot(),
				audioResumes: (globalThis as any).__doomAudioResumeCalls,
			}));
			expect(started.shell).toMatchObject({ phase: 'playing', pointerLocked: true });
			expect(started.audioResumes).toBe(1);
			expect(started.snapshot.enemies).toHaveLength(5);
			expect(started.snapshot.collectibles).toHaveLength(11);
			expect(await page.locator('[data-doom-crosshair="true"]').count()).toBe(1);
			expect(await page.locator('.octane-doom-stats').count()).toBeGreaterThan(0);

			const initial = started.snapshot;
			await moveForward(page, initial.player.z);
			await page.keyboard.down('Space');
			await expect
				.poll(async () => {
					return page.evaluate(() => {
						const snapshot = (globalThis as any).__OCTANE_DOOM_PROOF__.getSnapshot();
						return {
							projectile: snapshot.projectiles.some(
								(projectile: any) => projectile.owner === 'player',
							),
							weaponFiring: snapshot.weaponFiring,
							weaponIndicator: document.querySelector('[data-doom-weapon="firing"]') !== null,
						};
					});
				})
				.toEqual({ projectile: true, weaponFiring: true, weaponIndicator: true });
			await page.keyboard.up('Space');
			const active = await page.evaluate(() =>
				(globalThis as any).__OCTANE_DOOM_PROOF__.getSnapshot(),
			);
			expect(active.player.z).toBeLessThan(initial.player.z);
			expect(active.now).toBeGreaterThan(initial.now);

			const framebuffer = await page.evaluate(async () => {
				await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
				const canvas = document.querySelector(
					'[data-doom-level="active"] canvas',
				) as HTMLCanvasElement;
				const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
				if (gl === null) throw new Error('Doom Canvas exposed no WebGL context.');
				gl.finish();
				const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
				gl.readPixels(
					0,
					0,
					gl.drawingBufferWidth,
					gl.drawingBufferHeight,
					gl.RGBA,
					gl.UNSIGNED_BYTE,
					pixels,
				);
				let nonempty = 0;
				for (let index = 3; index < pixels.length; index += 4) if (pixels[index] !== 0) nonempty++;
				return {
					error: gl.getError(),
					height: gl.drawingBufferHeight,
					nonempty,
					width: gl.drawingBufferWidth,
				};
			});
			expect(framebuffer).toMatchObject({ error: 0 });
			expect(framebuffer.width).toBeGreaterThan(0);
			expect(framebuffer.height).toBeGreaterThan(0);
			expect(framebuffer.nonempty).toBeGreaterThan(0);

			await page.evaluate(() => {
				(globalThis as any).__doomRejectPointerLock = true;
				(document as any).exitPointerLock();
			});
			await page.click('[data-doom-aim-retry="true"] button');
			await expect
				.poll(
					async () =>
						(await page.evaluate(() => (globalThis as any).__OCTANE_DOOM_PROOF__.getShell()))
							.permissionError,
				)
				.toContain('Proof pointer permission rejected');
			await page.evaluate(() => ((globalThis as any).__doomRejectPointerLock = false));
			await page.click('[data-doom-aim-retry="true"] button');
			await expect
				.poll(
					async () =>
						(await page.evaluate(() => (globalThis as any).__OCTANE_DOOM_PROOF__.getShell()))
							.pointerLocked,
				)
				.toBe(true);

			for (let cycle = 0; cycle < 2; cycle++) {
				await page.evaluate(() => {
					location.hash = '#counter';
				});
				await page.waitForSelector('[data-demo-id="counter"], h2');
				await expect
					.poll(() => page.evaluate(() => (globalThis as any).__OCTANE_DOOM_PROOF__))
					.toBeUndefined();
				await page.evaluate(() => {
					location.hash = '#doom';
				});
				await page.waitForSelector('[data-doom-landing="ready"]');
				await expect
					.poll(() => page.evaluate(() => Boolean((globalThis as any).__OCTANE_DOOM_PROOF__)))
					.toBe(true);
			}
			expect(await page.evaluate(() => (globalThis as any).__doomAudioCloseCalls)).toBeGreaterThan(
				0,
			);
			expect(
				errors.filter(function keepUnexpected(error) {
					return !(
						error.includes('wasm streaming compile failed') ||
						error.includes('falling back to ArrayBuffer instantiation')
					);
				}),
			).toEqual([]);
			expect(failedResponses).toEqual([]);
		} finally {
			await page.close();
			await browser.close();
		}
	}, 120_000);

	it('pointer-lock aim', async () => {
		const browser = await launchBrowser(webglLaunchOptions());
		const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
		try {
			await installDoomProofShims(page);
			await page.goto(`${origin}/#doom`, { waitUntil: 'load' });
			await enterDoomLevel(page);
			const before = await readDoomSnapshot(page);
			await page.evaluate(function dispatchAimDelta() {
				const event = new MouseEvent('mousemove', { bubbles: true });
				Object.defineProperty(event, 'movementX', { value: 120 });
				Object.defineProperty(event, 'movementY', { value: 0 });
				window.dispatchEvent(event);
			});
			await expect
				.poll(async function yawMoved() {
					const after = await readDoomSnapshot(page);
					return after.player.yaw - before.player.yaw;
				})
				.toBeCloseTo(120 * 0.0022, 5);
		} finally {
			await page.close();
			await browser.close();
		}
	}, 60_000);

	it('pointer unlock behavior', async () => {
		const browser = await launchBrowser(webglLaunchOptions());
		const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
		try {
			await installDoomProofShims(page);
			await page.goto(`${origin}/#doom`, { waitUntil: 'load' });
			await enterDoomLevel(page);
			const lockedShell = await readDoomShell(page);
			expect(lockedShell).toMatchObject({ phase: 'playing', pointerLocked: true, paused: false });
			await page.keyboard.press('Escape');
			await expect
				.poll(async function unlocked() {
					return (await readDoomShell(page)).pointerLocked;
				})
				.toBe(false);
			const unlockedShell = await readDoomShell(page);
			expect(unlockedShell).toMatchObject({ phase: 'playing', paused: false });
			const before = await readDoomSnapshot(page);
			await moveForward(page, before.player.z);
		} finally {
			await page.close();
			await browser.close();
		}
	}, 60_000);

	it('browser back to landing', async function browserBackToLanding() {
		const browser = await launchBrowser(webglLaunchOptions());
		const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
		try {
			await installDoomProofShims(page);
			await page.goto(`${origin}/#doom`, { waitUntil: 'load' });
			await enterDoomLevel(page);
			const active = await readDoomSnapshot(page);
			const moved = await moveForward(page, active.player.z);
			expect(moved.player.z).toBeLessThan(active.player.z);
			await page.goBack();
			await page.waitForSelector('[data-doom-shell="landing"]');
			expect(
				await page.evaluate(function proofStillMounted() {
					return Boolean((globalThis as any).__OCTANE_DOOM_PROOF__);
				}),
			).toBe(true);
			await page.click('[data-doom-start="true"]');
			await page.waitForSelector('[data-doom-shell="playing"]');
			const reset = await readDoomSnapshot(page);
			expect(reset.enemies).toHaveLength(5);
			expect(reset.collectibles).toHaveLength(11);
			expect(reset.player.z).toBeCloseTo(active.player.z, 5);
		} finally {
			await page.close();
			await browser.close();
		}
	}, 60_000);

	it('WebGL failure recovery', async () => {
		const browser = await launchBrowser(webglLaunchOptions());
		const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
		try {
			await page.addInitScript(function denyWebGL() {
				const original = HTMLCanvasElement.prototype.getContext;
				HTMLCanvasElement.prototype.getContext = function getContext(type: string, ...args: any[]) {
					if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
					return original.call(this, type, ...args);
				};
			});
			await installDoomProofShims(page);
			await page.goto(`${origin}/#doom`, { waitUntil: 'load' });
			await page.waitForSelector('[data-doom-landing="ready"]');
			await page.click('[data-doom-start="true"]');
			await page.waitForSelector('[data-doom-webgl-failure="true"]');
			expect(await page.locator('[data-doom-level="active"]').count()).toBe(0);
			expect(await page.locator('[data-doom-shell="failed"]').count()).toBe(1);
			await page.click('[data-doom-webgl-failure="true"] button');
			await page.waitForSelector('[data-doom-landing="ready"]');
		} finally {
			await page.close();
			await browser.close();
		}
	}, 60_000);
});
