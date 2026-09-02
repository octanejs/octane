import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function localCssImports(file: string) {
	return [...readFileSync(file, 'utf8').matchAll(/@import\s+(?:url\()?['"](\.[^'"]+)['"]\)?/g)].map(
		([, specifier]) => resolve(dirname(file), specifier),
	);
}

function expectCssGraphToResolve(entry: string) {
	const pending = [entry];
	const visited = new Set<string>();
	while (pending.length) {
		const file = pending.pop()!;
		expect(existsSync(file), file).toBe(true);
		if (visited.has(file)) continue;
		visited.add(file);
		pending.push(...localCssImports(file));
	}
}

describe('@octanejs/puck — stylesheet exports', () => {
	it('resolves every local import from both public CSS subpaths', () => {
		const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
		for (const subpath of ['./puck.css', './dist/index.css']) {
			expectCssGraphToResolve(join(packageRoot, manifest.exports[subpath]));
		}
	});

	it('keeps the authored bundle CSS when the upstream port is regenerated', () => {
		const fixture = mkdtempSync(join(tmpdir(), 'octane-puck-upstream-'));
		const destination = mkdtempSync(join(tmpdir(), 'octane-puck-port-'));
		temporaryDirectories.push(fixture, destination);

		mkdirSync(join(fixture, 'bundle'), { recursive: true });
		writeFileSync(join(fixture, 'bundle/core.ts'), 'export const fixture = true;\n');
		writeFileSync(join(fixture, 'styles.css'), "@import './bundle/index.css';\n");
		writeFileSync(join(fixture, 'bundle/index.css'), "@import './core.css';\n");
		writeFileSync(join(fixture, 'bundle/core.css'), ':root { --fixture: true; }\n');

		execFileSync(process.execPath, [
			join(packageRoot, 'scripts/port-upstream.mjs'),
			fixture,
			destination,
		]);

		expect(readFileSync(join(destination, 'bundle/index.css'), 'utf8')).toBe(
			"@import './core.css';\n",
		);
		expect(readFileSync(join(destination, 'bundle/core.css'), 'utf8')).toBe(
			':root { --fixture: true; }\n',
		);
	});
});
