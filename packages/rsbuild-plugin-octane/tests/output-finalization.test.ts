import { mkdtempSync, mkdirSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { finalizeOctaneRsbuildOutput } from '../src/build.js';

const roots: string[] = [];
function fixture(clientBuild?: unknown) {
	const root = mkdtempSync(join(tmpdir(), 'octane-output-build-'));
	roots.push(root);
	mkdirSync(join(root, 'dist/client'), { recursive: true });
	mkdirSync(join(root, 'dist/server'), { recursive: true });
	writeFileSync(join(root, 'dist/client/index.html'), '<html>current</html>');
	writeFileSync(join(root, 'dist/client/octane-client-assets.json'), '{}');
	writeFileSync(join(root, 'dist/server/entry.js'), 'export {};');
	if (clientBuild !== undefined) {
		writeFileSync(join(root, 'dist/client/octane-client-build.json'), JSON.stringify(clientBuild));
	}
	return root;
}
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('delivers the completed client build beside the server even without independent widgets', async () => {
	const clientBuild = {
		version: 1,
		buildId: 'actual-client-build',
		mode: 'production',
		capabilities: { independentHydration: false },
	};
	const root = fixture(clientBuild);
	await finalizeOctaneRsbuildOutput({ root, config: { build: { outDir: 'dist' } } as any });
	expect(
		JSON.parse(readFileSync(join(root, 'dist/server/octane-client-build.json'), 'utf8')),
	).toEqual(clientBuild);
	expect(existsSync(join(root, 'dist/client/octane-client-build.json'))).toBe(false);
});

it.each([
	undefined,
	{ version: 1, buildId: '', mode: 'production', capabilities: { independentHydration: false } },
	{
		version: 1,
		buildId: 'development-build',
		mode: 'development',
		capabilities: { independentHydration: false },
	},
])(
	'rejects missing or incompatible production build metadata before moving artifacts',
	async (clientBuild) => {
		const root = fixture(clientBuild);
		await expect(
			finalizeOctaneRsbuildOutput({ root, config: { build: { outDir: 'dist' } } as any }),
		).rejects.toThrow(/client build/i);
		expect(readFileSync(join(root, 'dist/client/index.html'), 'utf8')).toBe('<html>current</html>');
		expect(existsSync(join(root, 'dist/server/index.html'))).toBe(false);
	},
);
