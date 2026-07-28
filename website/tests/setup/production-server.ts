// A single production build and a single preview server, shared by every spec in
// the website-integration project rather than built once per spec.
//
// (The project still runs a second server overall — the Vite dev server that
// ssr-hydration.e2e boots for its dev-SSR pass. That one is a different seam and
// stays with the suite that owns it. What is shared here is production.)
//
// Both server-backed specs used to build the site themselves: ssr-smoke ran a
// `NITRO_PRESET=node-server` build and drove `.output/server/index.mjs`, while
// the production half of ssr-hydration.e2e ran a `NITRO_PRESET=vercel` build and
// drove `vite preview`. A full run therefore compiled the website twice —
// ~65s each — and booted two servers to serve the same routes from the same
// sources. Building once here and handing both specs the origin is worth more
// than a minute of every run.
//
// The surviving preset is `vercel`, because ssr-hydration.e2e asserts the
// Vercel Build Output API contract against `.vercel/output` and website/
// vite.config.ts hard-codes that preset's function runtime and route table —
// coverage that only this preset can satisfy.
//
// KNOWN COVERAGE GAP: `node-server` is not a dead preset. It is what a plain
// `pnpm --filter website build` emits locally, and `pnpm --filter website start`
// runs `.output/server/index.mjs` (see website/README.md). Nothing smoke-tests
// that artifact any more. Re-adding it means paying for a second full build, so
// it is a deliberate trade, not an oversight.
//
// Project-scoped, so unrelated vitest projects never pay for it: `globalSetup`
// declared on a project runs only when that project is part of the run.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import { getFreePort, spawnServer, stopServer, waitForServer } from '../support/server-process.ts';

declare module 'vitest' {
	interface ProvidedContext {
		/** Origin of the shared production preview server, e.g. `http://localhost:4321`. */
		productionOrigin: string;
		/** Absolute path to the Vercel Build Output directory the run was served from. */
		productionOutputDir: string;
	}
}

const WEBSITE = fileURLToPath(new URL('../..', import.meta.url));
const OUTPUT_DIR = join(WEBSITE, '.vercel/output');
const PRODUCTION_ENV = { NODE_ENV: 'production', NITRO_PRESET: 'vercel' };

let server: ChildProcess | undefined;

function buildWebsite(): Promise<void> {
	return new Promise((resolve, reject) => {
		const build = spawn('pnpm', ['exec', 'vite', 'build', '--configLoader', 'runner'], {
			cwd: WEBSITE,
			stdio: 'ignore',
			env: { ...process.env, ...PRODUCTION_ENV },
		});
		build.once('error', reject);
		build.once('exit', (code) =>
			code === 0 ? resolve() : reject(new Error(`vite build exited with code ${code}`)),
		);
	});
}

export async function setup(project: TestProject): Promise<void> {
	// Debugging a single browser assertion costs a full rebuild otherwise. This
	// is opt-in and never set in CI, so the default stays "the artifact under
	// test was built from the current tree".
	const reuse = process.env.OCTANE_WEBSITE_REUSE_BUILD === '1' && existsSync(OUTPUT_DIR);
	if (!reuse) await buildWebsite();

	const port = await getFreePort();
	server = spawnServer(
		WEBSITE,
		['exec', 'vite', 'preview', '--configLoader', 'runner', '--port', String(port), '--strictPort'],
		PRODUCTION_ENV,
	);
	const origin = `http://localhost:${port}`;
	await waitForServer(server, `${origin}/`, 30_000);

	project.provide('productionOrigin', origin);
	project.provide('productionOutputDir', OUTPUT_DIR);
}

export async function teardown(): Promise<void> {
	await stopServer(server);
	server = undefined;
}
