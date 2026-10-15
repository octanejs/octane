import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { octaneRouteGeneratorPlugin } from '@octanejs/tanstack-router/generator-plugin';
import { Generator, getConfig } from '#tanstack-start/router-generator';
import { buildRouteTreeFileFooterFromConfig } from '#tanstack-start/plugin-core/start-router-plugin/route-tree-footer';

let fixtureRoot: string | undefined;

afterEach(() => {
	if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
	fixtureRoot = undefined;
});

function externalSpecifiers(source: string): Array<string> {
	return [...source.matchAll(/(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)]
		.map((match) => match[1])
		.filter((specifier) => !specifier.startsWith('.') && !specifier.startsWith('/'));
}

describe('Octane route generation', () => {
	it.each([false, true])(
		'scaffolds TSRX routes for compiled=%s with matching public imports',
		async (compiled) => {
			fixtureRoot = mkdtempSync(join(tmpdir(), 'octane-start-generator-'));
			const sourceDirectory = join(fixtureRoot, 'src');
			const routesDirectory = join(sourceDirectory, 'routes');
			const generatedRouteTree = join(sourceDirectory, 'routeTree.gen.ts');
			const routerFile = join(sourceDirectory, 'router.ts');
			mkdirSync(routesDirectory, { recursive: true });
			writeFileSync(join(routesDirectory, '__root.tsrx'), '');
			writeFileSync(join(routesDirectory, 'posts.$postId.tsrx'), '');
			writeFileSync(routerFile, 'export function getRouter() {}\n');

			const routeTreeFileFooter = buildRouteTreeFileFooterFromConfig({
				generatedRouteTreePath: generatedRouteTree,
				getConfig: () => ({
					startConfig: { router: {} },
					resolvedStartConfig: {
						routerFilePath: routerFile,
						startFilePath: undefined,
					},
				}),
				corePluginOpts: { framework: 'octane' },
			});
			const config = getConfig(
				{
					target: 'octane',
					compiled,
					routesDirectory,
					generatedRouteTree,
					disableLogging: true,
					routeTreeFileFooter,
					plugins: [octaneRouteGeneratorPlugin()],
				},
				fixtureRoot,
			);

			await new Generator({ config, root: fixtureRoot }).run();

			const routeFiles = readdirSync(routesDirectory).sort();
			const rootRoute = readFileSync(join(routesDirectory, '__root.tsrx'), 'utf8');
			const postRoute = readFileSync(join(routesDirectory, 'posts.$postId.tsrx'), 'utf8');
			const routeTree = readFileSync(generatedRouteTree, 'utf8');
			const generatedSources = [rootRoute, postRoute, routeTree].join('\n');

			expect(routeFiles).toEqual(['__root.tsrx', 'posts.$postId.tsrx']);
			expect(rootRoute).toContain('function RootComponent() @{');
			expect(postRoute).toContain('createFileRoute("/posts/$postId")');
			expect(routeTree).toContain("from './routes/__root.tsrx'");
			expect(new Set(externalSpecifiers(generatedSources))).toEqual(
				new Set([
					compiled ? '@octanejs/tanstack-router/compiled' : '@octanejs/tanstack-router',
					'@octanejs/tanstack-start',
				]),
			);
		},
	);
	it.each([false, true])(
		'rejects mixed Router contexts without rewriting the route for compiled=%s',
		async (compiled) => {
			fixtureRoot = mkdtempSync(join(tmpdir(), 'octane-start-mixed-router-'));
			const routesDirectory = join(fixtureRoot, 'src/routes');
			mkdirSync(routesDirectory, { recursive: true });
			writeFileSync(join(routesDirectory, '__root.tsrx'), '');
			const otherModule = '@octanejs/tanstack-router' + (compiled ? '' : '/compiled');
			const source = `import { createFileRoute, useParams } from '${otherModule}';
export const Route = createFileRoute('/')({ component: Page });
function Page() @{ const params = useParams(); <div>{JSON.stringify(params) as string}</div> }
`;
			const routeFile = join(routesDirectory, 'index.tsrx');
			writeFileSync(routeFile, source);
			const config = getConfig(
				{
					target: 'octane',
					compiled,
					routesDirectory,
					disableLogging: true,
					plugins: [octaneRouteGeneratorPlugin()],
				},
				fixtureRoot,
			);
			await expect(new Generator({ config, root: fixtureRoot }).run()).rejects.toThrow(
				'Use the matching Router entry throughout the route tree',
			);
			expect(readFileSync(routeFile, 'utf8')).toBe(source);
		},
	);
});
