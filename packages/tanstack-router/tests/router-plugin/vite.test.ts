import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Plugin } from 'vite';
import { tanstackRouter } from '../../src/vite.js';

let fixtureRoot: string | undefined;

afterEach(() => {
	if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
	fixtureRoot = undefined;
});

function findGeneratorPlugin(plugins: ReturnType<typeof tanstackRouter>): Plugin {
	const list = Array.isArray(plugins) ? plugins : [plugins];
	const plugin = list.find((item) => item.name === 'tanstack:router-generator');
	if (!plugin) throw new Error('router-generator plugin not found in tanstackRouter() output');
	return plugin as Plugin;
}

describe('@octanejs/tanstack-router/vite', () => {
	it('scaffolds native TSRX route bodies with no explicit plugins option', async () => {
		fixtureRoot = mkdtempSync(join(tmpdir(), 'octane-router-vite-'));
		const routesDirectory = join(fixtureRoot, 'src/routes');
		const generatedRouteTree = join(fixtureRoot, 'src/routeTree.gen.ts');
		mkdirSync(routesDirectory, { recursive: true });
		writeFileSync(
			join(routesDirectory, '__root.tsrx'),
			`
import { createRootRoute } from '@octanejs/tanstack-router';

export const Route = createRootRoute();

function RootComponent() @{
	<div>{'root' as string}</div>
}
`,
		);
		writeFileSync(join(routesDirectory, 'index.tsrx'), '');

		const plugin = findGeneratorPlugin(
			tanstackRouter({ routesDirectory, generatedRouteTree, disableLogging: true }),
		);
		const configResolved = (plugin.configResolved as (config: unknown) => Promise<void>).bind(
			plugin,
		);
		await configResolved({ root: fixtureRoot, plugins: [] });

		const rootRoute = readFileSync(join(routesDirectory, '__root.tsrx'), 'utf8');
		const routeTree = readFileSync(generatedRouteTree, 'utf8');

		// If the masking plugin were not wired in by default, the generator's
		// TypeScript-oriented parser would choke on `@{ }` and either throw or
		// mangle this native template body when rewriting the route file.
		expect(rootRoute).toContain('function RootComponent() @{');
		expect(rootRoute).toContain("<div>{'root' as string}</div>");
		expect(routeTree).toContain("from './routes/__root.tsrx'");
		expect(routeTree).toContain("from './routes/index.tsrx'");
	});
});
