import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({
	compileMdx: vi.fn(),
}));

vi.mock('../src/compile.js', () => ({
	compileMdx: mocks.compileMdx,
}));

import { octaneMdx } from '../src/vite.js';

describe('octaneMdx() compiler options', () => {
	beforeEach(() => {
		mocks.compileMdx.mockReset().mockResolvedValue({ code: 'export default null', map: null });
	});

	it('enables profiling only for client transforms', async () => {
		const normal = octaneMdx();
		normal.configResolved({ command: 'build', root: '/project' });
		await normal.transform.call({}, '# normal', '/project/docs/normal.mdx?v=1');
		expect(mocks.compileMdx).toHaveBeenLastCalledWith('# normal', '/project/docs/normal.mdx', {
			mode: 'client',
			hmr: false,
			dev: false,
			profile: false,
		});

		const client = octaneMdx({ profile: true });
		client.configResolved({ command: 'build', root: '/project' });
		await client.transform.call({}, '# client', '/project/docs/client.mdx');

		expect(mocks.compileMdx).toHaveBeenLastCalledWith('# client', '/docs/client.mdx', {
			mode: 'client',
			hmr: false,
			dev: false,
			profile: true,
		});

		const server = octaneMdx({ profile: true, ssr: true });
		server.configResolved({ command: 'build', root: '/project' });
		await server.transform.call({}, '# server', '/project/docs/server.mdx');

		expect(mocks.compileMdx).toHaveBeenLastCalledWith('# server', '/project/docs/server.mdx', {
			mode: 'server',
			hmr: false,
			dev: false,
			profile: false,
		});
	});

	it('uses portable package and external IDs without changing normal or server filenames', async () => {
		const fixtureRoot = mkdtempSync(join(tmpdir(), 'octane-mdx-profile-id-'));
		try {
			const projectRoot = join(fixtureRoot, 'project');
			mkdirSync(projectRoot);
			writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'app' }));

			const packageRoot = join(fixtureRoot, 'shared-docs');
			const packageContent = join(packageRoot, 'content');
			mkdirSync(packageContent, { recursive: true });
			const packageManifest = join(packageRoot, 'package.json');
			writeFileSync(packageManifest, JSON.stringify({ name: '@scope/docs' }));
			const packageDocument = join(packageContent, 'Guide.mdx');

			const externalRoot = join(fixtureRoot, 'unowned');
			mkdirSync(externalRoot);
			const externalDocument = join(externalRoot, 'Loose.mdx');

			const addWatchFile = vi.fn();
			const profiled = octaneMdx({ profile: true });
			profiled.configResolved({ command: 'build', root: projectRoot });
			await profiled.transform.call({ addWatchFile }, '# package', packageDocument);
			let compiledId = mocks.compileMdx.mock.lastCall?.[1];
			expect(compiledId).toBe('/@package/%40scope%2Fdocs/content/Guide.mdx');
			expect(compiledId).not.toContain(fixtureRoot);
			expect(addWatchFile).toHaveBeenCalledWith(packageManifest);

			await profiled.transform.call({ addWatchFile }, '# external', externalDocument);
			compiledId = mocks.compileMdx.mock.lastCall?.[1];
			expect(compiledId).toBe('/@external/Loose.mdx');
			expect(compiledId).not.toContain(fixtureRoot);

			const normal = octaneMdx({ profile: false });
			normal.configResolved({ command: 'build', root: projectRoot });
			await normal.transform.call({}, '# normal package', packageDocument);
			expect(mocks.compileMdx.mock.lastCall?.[1]).toBe(packageDocument);

			const server = octaneMdx({ profile: true, ssr: true });
			server.configResolved({ command: 'build', root: projectRoot });
			await server.transform.call({}, '# server package', packageDocument);
			expect(mocks.compileMdx.mock.lastCall?.[1]).toBe(packageDocument);
		} finally {
			rmSync(fixtureRoot, { recursive: true, force: true });
		}
	});
});
