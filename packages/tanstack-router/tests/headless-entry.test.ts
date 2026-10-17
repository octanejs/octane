// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { expect, it } from 'vitest';

it('loads a headless route through the public entry without a renderer compiler', async () => {
	const result = await build({
		bundle: true,
		format: 'esm',
		platform: 'node',
		write: false,
		stdin: {
			resolveDir: fileURLToPath(new URL('..', import.meta.url)),
			contents: `
				import { BaseRootRoute, BaseRoute, createMemoryHistory, createRouter } from '@octanejs/tanstack-router/core';
				const root = new BaseRootRoute();
				const page = new BaseRoute({ getParentRoute: () => root, path: 'items/$id' });
				const router = createRouter({
					routeTree: root.addChildren([page]),
					history: createMemoryHistory({ initialEntries: ['/items/42'] }),
				});
				await router.load();
				const match = router.state.matches.at(-1);
				process.stdout.write(JSON.stringify({ pathname: router.state.location.pathname, id: match.params.id, status: match.status }));
			`,
		},
	});
	const output = execFileSync(process.execPath, ['--input-type=module', '-'], {
		input: result.outputFiles[0]!.contents,
		encoding: 'utf8',
	});
	expect(JSON.parse(output)).toEqual({ pathname: '/items/42', id: '42', status: 'success' });
});
