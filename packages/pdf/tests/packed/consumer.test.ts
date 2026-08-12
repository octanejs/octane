import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { build, createServer } from 'vite';

import { octane } from '../../../octane/src/compiler/vite.js';

const exec = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const packageRoot = resolve(repositoryRoot, 'packages/pdf');
const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});

describe('@octanejs/pdf packed consumer', () => {
	// @parity-case packed:react-pdf-consumer
	it('builds client/server imports and executes SSR without React', async () => {
		const root = await mkdtemp(join(tmpdir(), 'octane-pdf-packed-'));
		temporaryRoots.push(root);
		const packageDirectory = join(root, 'node_modules/@octanejs/pdf');
		await mkdir(packageDirectory, { recursive: true });
		const { stdout } = await exec('pnpm', ['pack', '--pack-destination', root], {
			cwd: packageRoot,
			env: { ...process.env, CI: 'true' },
			encoding: 'utf8',
		});
		const packedPath = stdout.trim().split('\n').at(-1)!;
		const tarball = packedPath.startsWith('/') ? packedPath : join(root, packedPath);
		await exec('tar', ['-xzf', tarball, '--strip-components=1', '-C', packageDirectory]);
		await symlink(resolve(repositoryRoot, 'packages/octane'), join(root, 'node_modules/octane'));
		await symlink(
			resolve(packageRoot, 'node_modules/pdfjs-dist'),
			join(root, 'node_modules/pdfjs-dist'),
		);
		await symlink(
			resolve(packageRoot, 'node_modules/make-event-props'),
			join(root, 'node_modules/make-event-props'),
		);

		const publishedManifest = JSON.parse(
			await readFile(join(packageDirectory, 'package.json'), 'utf8'),
		) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
		expect(publishedManifest.dependencies).toEqual({
			'make-event-props': '2.0.0',
			'pdfjs-dist': '5.4.296',
		});
		expect(publishedManifest.peerDependencies).toEqual({
			octane: expect.stringMatching(/^\d+\.\d+\.\d+$/),
		});
		expect([
			...Object.keys(publishedManifest.dependencies ?? {}),
			...Object.keys(publishedManifest.peerDependencies ?? {}),
		]).not.toContain('react');

		await writeFile(
			join(root, 'client.tsrx'),
			`import '@octanejs/pdf/dist/Page/AnnotationLayer.css';
import '@octanejs/pdf/dist/Page/TextLayer.css';
import { Document, Page, pdfjs } from '@octanejs/pdf';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export const view = <Document file="document.pdf"><Page pageNumber={1} /></Document>;
`,
		);
		await build({
			configFile: false,
			root,
			logLevel: 'error',
			plugins: [octane()],
			build: {
				outDir: join(root, 'dist-client'),
				emptyOutDir: true,
				rollupOptions: { input: join(root, 'client.tsrx') },
			},
		});

		await writeFile(
			join(root, 'server.tsrx'),
			`import { Document } from '@octanejs/pdf';
import { renderToString } from 'octane/server';
function Fixture() { return <Document noData="Packed PDF" />; }
export function render() { return renderToString(Fixture).html; }
`,
		);
		const server = await createServer({
			configFile: false,
			root,
			logLevel: 'silent',
			appType: 'custom',
			plugins: [octane({ ssr: true })],
			server: { middlewareMode: true, hmr: false },
		});
		try {
			const module = await server.ssrLoadModule('/server.tsrx');
			expect(module.render()).toContain('Packed PDF');
		} finally {
			await server.close();
		}
	});
});
