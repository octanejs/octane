import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { octaneMdx } from '../src/vite.js';

const SOURCE = '# Profiled document\n';

function configure(options: Parameters<typeof octaneMdx>[0], root: string) {
	const plugin = octaneMdx(options);
	plugin.configResolved({ command: 'build', root });
	return plugin;
}

async function transform(plugin: ReturnType<typeof octaneMdx>, id: string) {
	return plugin.transform.call({ addWatchFile() {} }, SOURCE, id);
}

describe('octaneMdx() profile source privacy', () => {
	it('emits portable project, package, and unowned external identities', async () => {
		const fixtureRoot = mkdtempSync(join(tmpdir(), 'octane-mdx-profile-output-'));
		try {
			const projectRoot = join(fixtureRoot, 'project');
			const projectDocument = join(projectRoot, 'docs/App.mdx');
			mkdirSync(join(projectRoot, 'docs'), { recursive: true });
			writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'app' }));

			const packageRoot = join(fixtureRoot, 'shared-docs');
			const packageDocument = join(packageRoot, 'content/Guide.mdx');
			mkdirSync(join(packageRoot, 'content'), { recursive: true });
			writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ name: '@scope/docs' }));

			const externalRoot = join(fixtureRoot, 'unowned');
			const externalDocument = join(externalRoot, 'Loose.mdx');
			mkdirSync(externalRoot);

			const plugin = configure({ profile: true }, projectRoot);
			const project = await transform(plugin, projectDocument);
			expect(project?.code).toContain('"file":"/docs/App.mdx"');
			expect(JSON.stringify(project)).not.toContain(fixtureRoot);

			const packaged = await transform(plugin, packageDocument);
			expect(packaged?.code).toContain('"file":"/@package/%40scope%2Fdocs/content/Guide.mdx"');
			expect(JSON.stringify(packaged)).not.toContain(fixtureRoot);

			const external = await transform(plugin, externalDocument);
			expect(external?.code).toContain('"file":"/@external/Loose.mdx"');
			expect(JSON.stringify(external)).not.toContain(fixtureRoot);
		} finally {
			rmSync(fixtureRoot, { recursive: true, force: true });
		}
	});

	it('keeps normal and server adapter output byte-identical when profile is off', async () => {
		const fixtureRoot = mkdtempSync(join(tmpdir(), 'octane-mdx-profile-off-'));
		try {
			const projectRoot = join(fixtureRoot, 'project');
			const externalRoot = join(fixtureRoot, 'shared-docs');
			const document = join(externalRoot, 'Guide.mdx');
			mkdirSync(projectRoot);
			mkdirSync(externalRoot);
			writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({ name: 'app' }));

			const implicit = await transform(configure({}, projectRoot), document);
			const explicitOff = await transform(configure({ profile: false }, projectRoot), document);
			expect(explicitOff).toEqual(implicit);

			const server = await transform(configure({ ssr: true }, projectRoot), document);
			const serverProfile = await transform(
				configure({ ssr: true, profile: true }, projectRoot),
				document,
			);
			expect(serverProfile).toEqual(server);
		} finally {
			rmSync(fixtureRoot, { recursive: true, force: true });
		}
	});
});
