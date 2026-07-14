import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serveStaticFile } from '../src/server/node-http.js';

describe('serveStaticFile cache policy', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'octane-static-cache-'));
		for (const directory of ['assets', 'static']) {
			mkdirSync(join(root, directory), { recursive: true });
			writeFileSync(join(root, directory, 'app-123.js'), 'export {};\n');
		}
		writeFileSync(join(root, 'robots.txt'), 'User-agent: *\n');
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	function cacheControl(pathname: string) {
		const headers = new Map<string, unknown>();
		const response = {
			statusCode: 0,
			setHeader: vi.fn((name: string, value: unknown) => headers.set(name, value)),
			end: vi.fn(),
		};
		expect(serveStaticFile({ method: 'HEAD', url: pathname } as any, response as any, root)).toBe(
			true,
		);
		return headers.get('Cache-Control');
	}

	it('marks Vite and Rsbuild hashed asset directories immutable', () => {
		expect(cacheControl('/assets/app-123.js')).toBe('public, max-age=31536000, immutable');
		expect(cacheControl('/static/app-123.js')).toBe('public, max-age=31536000, immutable');
	});

	it('keeps root public files revalidatable', () => {
		expect(cacheControl('/robots.txt')).toBe('public, max-age=0, must-revalidate');
	});
});
