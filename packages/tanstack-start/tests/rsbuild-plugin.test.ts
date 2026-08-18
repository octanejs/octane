import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createRsbuild } from '@rsbuild/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tanstackStart } from '@octanejs/tanstack-start/plugin/rsbuild';

const repositoryRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const execFileAsync = promisify(execFile);

function write(root: string, relativePath: string, content: string) {
	const file = join(root, relativePath);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
	return file;
}

function link(root: string, packageName: string, target: string) {
	const destination = join(root, 'node_modules', ...packageName.split('/'));
	mkdirSync(dirname(destination), { recursive: true });
	if (existsSync(destination) || lstatMaybe(destination)) {
		rmSync(destination, { recursive: true });
	}
	symlinkSync(target, destination, 'dir');
}

function lstatMaybe(file: string) {
	try {
		return lstatSync(file);
	} catch {
		return null;
	}
}

function listFiles(root: string, current = root): string[] {
	if (!existsSync(current)) return [];
	return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
		const file = join(current, entry.name);
		return entry.isDirectory() ? listFiles(root, file) : [file.slice(root.length + 1)];
	});
}

describe('TanStack Start Rsbuild integration', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'octane-tanstack-start-rsbuild-'));
		write(
			root,
			'package.json',
			JSON.stringify({
				name: 'octane-tanstack-start-rsbuild-fixture',
				private: true,
				type: 'module',
			}) + '\n',
		);
		write(
			root,
			'tsconfig.json',
			JSON.stringify({
				compilerOptions: {
					jsx: 'preserve',
					jsxImportSource: 'octane',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					target: 'ES2022',
				},
				include: ['src'],
			}) + '\n',
		);
		link(root, 'octane', join(repositoryRoot, 'packages/octane'));
		link(root, '@octanejs/tanstack-router', join(repositoryRoot, 'packages/tanstack-router'));
		link(root, '@octanejs/tanstack-start', join(repositoryRoot, 'packages/tanstack-start'));

		write(
			root,
			'src/router.ts',
			`import { createRouter } from '@octanejs/tanstack-router';
import { routeTree } from './routeTree.gen';

export function getRouter() {
	return createRouter({ routeTree });
}
`,
		);
		write(
			root,
			'src/routes/__root.tsx',
			`/** @jsxImportSource octane */
import {
	Body,
	Head,
	HeadContent,
	Html,
	Outlet,
	Scripts,
	createRootRoute,
} from '@octanejs/tanstack-router';

export const Route = createRootRoute({
	shellComponent: RootDocument,
	component: RootLayout,
});

function RootDocument(props: { children?: unknown }) {
	return (
		<Html lang="en">
			<Head><HeadContent /></Head>
			<Body>{props.children}<Scripts /></Body>
		</Html>
	);
}

function RootLayout() {
	return <Outlet />;
}
`,
		);
		write(
			root,
			'src/loadMessage.ts',
			`import { createServerFn } from '@octanejs/tanstack-start';

export const loadMessage = createServerFn({ method: 'GET' }).handler(
	() => 'rsbuild-server-function',
);
`,
		);
		write(
			root,
			'src/BrowserOnlyProof.client.tsrx',
			`if (typeof window === 'undefined') {
	throw new Error('ClientOnly browser module reached the server');
}

export function BrowserOnlyProof() @{
	<span data-client-only-proof="ready">browser only</span>
}
`,
		);
		write(
			root,
			'src/routes/index.tsrx',
			`import { ClientOnly, createFileRoute } from '@octanejs/tanstack-router';
import { BrowserOnlyProof } from '../BrowserOnlyProof.client.tsrx';
import { loadMessage } from '../loadMessage';

export const Route = createFileRoute('/')({
	loader: () => loadMessage(),
	component: Home,
});

function Home() {
	const message = Route.useLoaderData();
	return (
		<main data-rsbuild-start="ready">
			<span>{message as string}</span>
			<ClientOnly fallback={<span data-client-only-fallback="ready">server fallback</span>}>
				<BrowserOnlyProof />
			</ClientOnly>
		</main>
	);
}
`,
		);
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('serves TSRX routes, server functions, and ClientOnly fallback through Rsbuild dev', async () => {
		const instance = await createRsbuild({
			cwd: root,
			rsbuildConfig: {
				root,
				plugins: [tanstackStart({ octane: { parallel: false } })],
				dev: { lazyCompilation: false },
				server: { host: '127.0.0.1' },
			},
		});
		const started = await instance.startDevServer({ getPortSilently: true });

		try {
			const response = await fetch(`http://127.0.0.1:${started.port}/`);
			const html = await response.text();

			expect(response.status).toBe(200);
			expect(response.headers.get('content-type')).toMatch(/text\/html/);
			expect(html).toContain('data-rsbuild-start="ready"');
			expect(html).toContain('rsbuild-server-function');
			expect(html).toContain('data-client-only-fallback="ready"');
			expect(html).not.toContain('data-client-only-proof="ready"');
		} finally {
			await started.server.close();
		}
	}, 120_000);

	it('builds client assets and executable SSR without loading ClientOnly browser modules', async () => {
		const instance = await createRsbuild({
			cwd: root,
			rsbuildConfig: {
				root,
				plugins: [tanstackStart({ octane: { hmr: false, parallel: false } })],
				output: { minify: false },
			},
		});

		await instance.build();

		const clientRoot = join(root, 'dist/client');
		const serverEntry = join(root, 'dist/server/index.js');
		expect(listFiles(clientRoot).some((file) => file.endsWith('.js'))).toBe(true);
		expect(existsSync(serverEntry)).toBe(true);

		const serverUrl = pathToFileURL(serverEntry).href;
		const { stdout } = await execFileAsync(
			process.execPath,
			[
				'--input-type=module',
				'--eval',
				`const server = await import(${JSON.stringify(serverUrl)});
const response = await server.default.fetch(new Request('http://localhost/'));
console.log(JSON.stringify({
	status: response.status,
	contentType: response.headers.get('content-type'),
	html: await response.text(),
}));`,
			],
			{ cwd: root, maxBuffer: 10 * 1024 * 1024 },
		);
		const rendered = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
			status: number;
			contentType: string | null;
			html: string;
		};

		expect(rendered.status).toBe(200);
		expect(rendered.contentType).toMatch(/text\/html/);
		expect(rendered.html).toContain('data-rsbuild-start="ready"');
		expect(rendered.html).toContain('rsbuild-server-function');
		expect(rendered.html).toContain('data-client-only-fallback="ready"');
		expect(rendered.html).not.toContain('data-client-only-proof="ready"');
	}, 120_000);
});
