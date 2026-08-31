import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { build, preview, type PreviewServer } from 'vite';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '../../test-utils/playwright-browser.js';
import type {} from './candidate-probes.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const requireOctane = createRequire(new URL('../../packages/octane/package.json', import.meta.url));
const reactDOM = dirname(requireOctane.resolve('react-dom/package.json'));
const evidence: Record<string, unknown> = {};
const browserVersions: Record<string, string> = {};

afterAll(async () => {
	const destination = process.env.REACT_COMPAT_CANDIDATE_EVIDENCE_PATH;
	if (destination) {
		await writeFile(
			destination,
			JSON.stringify(
				{
					schemaVersion: 1,
					reactVersion: '19.2.7',
					capability: 'single-root-completed-commit-admission-only',
					runner: { node: process.version, platform: process.platform, arch: process.arch },
					browserVersions,
					candidateControls: evidence,
				},
				null,
				2,
			) + '\n',
		);
	}
});

describe.each(['development', 'production'] as const)(
	'pinned commit-admission candidate — %s browser',
	(mode) => {
		let directory: string;
		let server: PreviewServer;
		let browser: Browser;
		let page: Page;
		const failures: string[] = [];

		beforeAll(async () => {
			directory = await mkdtemp(join(tmpdir(), 'react-compat-commit-gate-'));
			const patched = join(directory, 'patched');
			execFileSync(process.execPath, [join(here, 'patch/materialize.mjs'), reactDOM, patched], {
				stdio: 'pipe',
			});
			const aliases = ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom'].map(
				(specifier) => ({
					find: new RegExp(`^${specifier.replaceAll('/', '\\/')}$`),
					replacement: requireOctane.resolve(specifier),
				}),
			);
			const config = {
				configFile: false as const,
				root: here,
				logLevel: 'error' as const,
				plugins: [react()],
				oxc: { jsx: { development: mode === 'development' } },
				define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
				resolve: {
					alias: [
						{ find: /^react-dom\/client$/, replacement: join(patched, 'client.cjs') },
						...aliases,
					],
				},
				build: {
					outDir: join(directory, 'dist'),
					emptyOutDir: false,
					minify: false as const,
					rolldownOptions: { input: join(here, 'candidate.html') },
				},
			};
			await build(config);
			server = await preview({ ...config, preview: { host: '127.0.0.1', port: 0 } });
			const address = server.httpServer.address();
			if (!address || typeof address === 'string')
				throw new Error('Candidate server has no TCP port');
			browser = await launchBrowser({ headless: true });
			browserVersions[mode] = browser.version();
			page = await browser.newPage();
			page.on('pageerror', (error) => failures.push(error.message));
			page.on('console', (message) => {
				if (message.type() === 'error' || message.type() === 'warning')
					failures.push(message.text());
			});
			await page.goto(`http://127.0.0.1:${address.port}/candidate.html`);
			await page.waitForFunction(() => window.reactCommitGateProbes?.reactVersion === '19.2.7');
		});

		afterAll(async () => {
			await page?.close();
			await browser?.close();
			await server?.close();
			if (directory) await rm(directory, { recursive: true, force: true });
		});

		const cases = [
			[
				'initial preparation publishes nothing before acceptance',
				'runInitialHold',
				{
					tokenStatus: 'committed',
					held: {
						content: null,
						portalContent: null,
						refActive: false,
						layoutValue: null,
						passiveValue: null,
						subscribed: false,
					},
					accepted: {
						content: 'initial',
						portalContent: 'initial',
						refActive: true,
						layoutValue: 'initial',
						passiveValue: 'initial',
						subscribed: true,
					},
				},
			],
			[
				'React-local updates wait without another root.render call',
				'runInternalUpdate',
				{
					tokenStatus: 'committed',
					held: { content: 'initial', layoutValue: 'initial', passiveValue: 'initial' },
					accepted: {
						content: 'candidate',
						portalContent: 'candidate',
						layoutValue: 'candidate',
						passiveValue: 'candidate',
					},
				},
			],
			[
				'superseded candidates cannot commit later',
				'runSupersededCandidate',
				{
					lateAccept: false,
					oldTokenStatus: 'aborted',
					latestTokenStatus: 'committed',
					accepted: { content: 'latest' },
				},
			],
			[
				'abandoning a candidate retains committed UI and subscriptions',
				'runExplicitAbort',
				{
					lateAccept: false,
					tokenStatus: 'aborted',
					afterAbort: { content: 'initial', subscribed: true },
					recovered: {
						content: 'latest',
						portalContent: 'latest',
						layoutValue: 'latest',
						passiveValue: 'latest',
						subscribed: true,
					},
					recoveredTokenStatus: 'committed',
				},
			],
			[
				'disposal revokes prepared work and releases the committed tree',
				'runDisposeHeldCandidate',
				{
					lateAccept: false,
					tokenStatus: 'aborted',
					afterDispose: {
						content: null,
						portalContent: null,
						refActive: false,
						layoutValue: null,
						passiveValue: null,
						subscribed: false,
					},
					cleanups: ['layout', 'passive', 'ref', 'subscription'],
				},
			],
			[
				'an ungated root from the patched client progresses while another candidate is held',
				'runUngatedRootWhileCandidateHeld',
				{
					heldGated: {
						content: 'initial',
						portalContent: 'initial',
						layoutValue: 'initial',
						passiveValue: 'initial',
					},
					ungatedInitial: {
						content: 'ungated-initial',
						refActive: true,
						layoutValue: 'ungated-initial',
						passiveValue: 'ungated-initial',
					},
					ungatedUpdated: {
						content: 'ungated-updated',
						refActive: true,
						layoutValue: 'ungated-updated',
						passiveValue: 'ungated-updated',
					},
					acceptedGated: { content: 'candidate', layoutValue: 'candidate' },
					ungatedAfterGateAcceptance: {
						content: 'ungated-updated',
						refActive: true,
						layoutValue: 'ungated-updated',
						passiveValue: 'ungated-updated',
					},
				},
			],
			[
				'sequential root acceptance still exposes mixed versions to layout effects',
				'runSequentialRootAcceptance',
				{
					atomicAcrossRoots: false,
					firstLayoutRead: { value: 'candidate', sibling: 'initial' },
					betweenAccepts: { left: 'candidate', right: 'initial' },
					settled: { left: 'candidate', right: 'candidate' },
				},
			],
		] as const;

		for (const [description, method, expected] of cases) {
			it(description, async () => {
				const result = await page.evaluate((name) => window.reactCommitGateProbes[name](), method);
				expect(result.observations).toMatchObject(expected);
				evidence[`${mode}:${method}`] = result;
				expect(failures).toEqual([]);
			});
		}
	},
);
