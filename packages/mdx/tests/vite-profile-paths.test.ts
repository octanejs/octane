import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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

async function transform(
	plugin: ReturnType<typeof octaneMdx>,
	id: string,
	watchFiles: string[] = [],
) {
	return plugin.transform.call(
		{ addWatchFile: (file: string) => watchFiles.push(file) },
		SOURCE,
		id,
	);
}

function profileFiles(code: string | undefined) {
	return new Set(Array.from(code?.matchAll(/"file":"([^"]+)"/g) ?? [], (match) => match[1]));
}

describe('octaneMdx() profile source privacy', () => {
	it('uses portable project, package, and external identities', async () => {
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
			const watchFiles: string[] = [];
			for (const [document, expected] of [
				[projectDocument, '/docs/App.mdx'],
				[packageDocument, '/@package/%40scope%2Fdocs/content/Guide.mdx'],
				[externalDocument, '/@external/Loose.mdx'],
			] as const) {
				const result = await transform(plugin, document, watchFiles);
				expect(profileFiles(result?.code)).toContain(expected);
				expect(result?.code).not.toContain(fixtureRoot);
				expect(result?.code).not.toContain(realpathSync(fixtureRoot));
			}
			expect(watchFiles).toContain(join(packageRoot, 'package.json'));
		} finally {
			rmSync(fixtureRoot, { recursive: true, force: true });
		}
	});

	it('leaves normal and server output unchanged', async () => {
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
