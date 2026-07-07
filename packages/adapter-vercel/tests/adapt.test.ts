// @vitest-environment node
//
// adapt() emitter test — feeds a fake completed octane build (the dist/client +
// dist/server layout @octanejs/vite-plugin produces) through adapt() and
// asserts the emitted `.vercel/output` is valid Build Output API v3: static
// assets, one self-contained Node function, and the routing config. The
// emitted function entry is then actually imported and invoked. The end-to-end
// wiring (closeBundle → adapt via `adapter: vercel()`) is covered by the
// website's ssr-smoke test, which runs the real `vite build`.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { adapt } from '../src/index.js';

// The tests dir doubles as the fake project root: the fake build goes in
// `dist/` and adapt() writes `.vercel/output/` next to it — both gitignored.
const root = fileURLToPath(new URL('.', import.meta.url));
const clientDir = path.join(root, 'dist/client');
const serverDir = path.join(root, 'dist/server');
const outputDir = path.join(root, '.vercel/output');
const funcDir = path.join(outputDir, 'functions/index.func');

// A stand-in for the plugin's self-contained server bundle: same shape (fetch
// `handler` export next to the SSR template), no dependencies.
const FAKE_ENTRY = `export const handler = async (req) => new Response('ok:' + new URL(req.url).pathname);\n`;

function write(file: string, data: string) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, data);
}

beforeAll(async () => {
	fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
	fs.rmSync(path.join(root, '.vercel'), { recursive: true, force: true });

	write(path.join(clientDir, 'assets/app-abc.js'), 'console.log("app");\n');
	write(path.join(serverDir, 'entry.js'), FAKE_ENTRY);
	write(path.join(serverDir, 'index.html'), '<!doctype html><html><!--ssr-body--></html>\n');

	await adapt({ root, outDir: 'dist', clientDir, serverDir, log: () => {} });
});

afterAll(() => {
	fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
	fs.rmSync(path.join(root, '.vercel'), { recursive: true, force: true });
});

describe('adapt()', () => {
	it('emits Build Output API v3 routing config', () => {
		const config = JSON.parse(fs.readFileSync(path.join(outputDir, 'config.json'), 'utf-8'));
		expect(config.version).toBe(3);

		// Static files first, then EVERYTHING else (including the 404 catch-all
		// route) goes to the SSR function.
		const filesystemIndex = config.routes.findIndex(
			(r: Record<string, unknown>) => r.handle === 'filesystem',
		);
		const catchAllIndex = config.routes.findIndex(
			(r: Record<string, unknown>) => r.src === '/.*' && r.dest === '/index',
		);
		expect(filesystemIndex).toBeGreaterThanOrEqual(0);
		expect(catchAllIndex).toBe(filesystemIndex + 1);

		// Hashed assets are immutable, applied BEFORE the filesystem handler.
		const assetsRoute = config.routes.find((r: Record<string, unknown>) => r.src === '/assets/.+');
		expect(assetsRoute).toMatchObject({
			headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
			continue: true,
		});
		expect(config.routes.indexOf(assetsRoute)).toBeLessThan(filesystemIndex);
	});

	it('copies the client bundle to static/ (no index.html to shadow SSR)', () => {
		expect(fs.existsSync(path.join(outputDir, 'static/assets/app-abc.js'))).toBe(true);
		expect(fs.existsSync(path.join(outputDir, 'static/index.html'))).toBe(false);
	});

	it('emits the serverless function: dist/server verbatim + wrapper + config', () => {
		for (const file of ['index.js', 'entry.js', 'index.html', '.vc-config.json', 'package.json']) {
			expect(fs.existsSync(path.join(funcDir, file)), file).toBe(true);
		}

		const vcConfig = JSON.parse(fs.readFileSync(path.join(funcDir, '.vc-config.json'), 'utf-8'));
		expect(vcConfig.handler).toBe('index.js');
		expect(vcConfig.launcherType).toBe('Nodejs');
		expect(vcConfig.runtime).toMatch(/^nodejs(20|22|24)\.x$/);

		// The wrapper imports as ESM — the function dir must say so.
		const pkg = JSON.parse(fs.readFileSync(path.join(funcDir, 'package.json'), 'utf-8'));
		expect(pkg.type).toBe('module');
	});

	it('emitted function entry serves requests through the bundled handler', async () => {
		const mod = await import(pathToFileURL(path.join(funcDir, 'index.js')).href);
		const response = await mod.default.fetch(new Request('http://x/hello'));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('ok:/hello');
	});
});
