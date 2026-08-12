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
//
// It does NOT follow that only this project waits for it. Vitest awaits every
// participating project's globalSetup, one after another, before it collects a
// single test file:
//
//   await this.initializeGlobalSetup(specifications)   // before pool.collectTests
//   for (const project of projects) await project._initializeGlobalSetup()
//
// So awaiting the build here stalled the entire run — all ~90 projects — for as
// long as the build took, measured locally at ~65s of a 73s dead window before
// the first test result appeared. CI never noticed because its shards exclude
// this project's specs, which drops the project from that loop entirely.
//
// The build therefore runs in the BACKGROUND: setup() reserves the port, hands
// the specs their origin, starts build→serve, and returns immediately. The two
// server-backed specs wait for readiness in their own beforeAll, so the other
// projects' tests run during the build instead of behind it.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import {
	reserveFreePort,
	spawnServer,
	stopServer,
	waitForChildExit,
	waitForServer,
	writeReadyState,
} from '../support/server-process.ts';

declare module 'vitest' {
	interface ProvidedContext {
		/** Origin of the shared production preview server, e.g. `http://localhost:4321`. */
		productionOrigin: string;
		/** Absolute path to the Vercel Build Output directory the run was served from. */
		productionOutputDir: string;
		/**
		 * File the background build/serve chain writes its terminal state to.
		 * Specs await it via `awaitProductionServer()` before their first request.
		 */
		productionReadyFile: string;
	}
}

const WEBSITE = fileURLToPath(new URL('../..', import.meta.url));
const OUTPUT_DIR = join(WEBSITE, '.vercel/output');
const PRODUCTION_ENV = { NODE_ENV: 'production', NITRO_PRESET: 'vercel' };
// The consolidated binding graph pushes the cold Vercel build beyond four
// minutes on GitHub's shared runners while it is still emitting chunks. This
// is one shared build (not a retry or a second wait), so retain a finite guard
// with enough headroom for the observed successful phase.
const BUILD_TIMEOUT_MS = 300_000;

let server: ChildProcess | undefined;
let build: ChildProcess | undefined;
let ready: Promise<void> | undefined;
let readyFile: string | undefined;
let tearingDown = false;

function buildWebsite(): Promise<void> {
	// Captured module-side so teardown can kill a build still in flight — the
	// run can be cancelled while this is the only thing still working.
	build = spawn('pnpm', ['exec', 'vite', 'build', '--configLoader', 'runner'], {
		cwd: WEBSITE,
		stdio: ['ignore', 'pipe', 'pipe'],
		detached: true,
		env: { ...process.env, ...PRODUCTION_ENV },
	});
	return waitForChildExit(build, 'website vite build', BUILD_TIMEOUT_MS);
}

export async function setup(project: TestProject): Promise<void> {
	// Debugging a single browser assertion costs a full rebuild otherwise. This
	// is opt-in and never set in CI, so the default stays "the artifact under
	// test was built from the current tree".
	const reuse = process.env.OCTANE_WEBSITE_REUSE_BUILD === '1' && existsSync(OUTPUT_DIR);

	// Held for the duration of the build, not just probed — see reserveFreePort.
	const reservation = await reserveFreePort();
	const origin = `http://localhost:${reservation.port}`;
	readyFile = join(tmpdir(), `octane-website-ready-${process.pid}-${reservation.port}.json`);

	// Provided BEFORE the work completes. These are static facts (a port we hold,
	// a path we control), so the specs can be handed them immediately; what they
	// must not assume is that the server is answering yet.
	project.provide('productionOrigin', origin);
	project.provide('productionOutputDir', OUTPUT_DIR);
	project.provide('productionReadyFile', readyFile);

	// Deliberately NOT awaited: returning here releases the rest of the run.
	// Every terminal state is recorded in the ready file, so a failure surfaces
	// as a real error in the waiting spec rather than as an unexplained timeout.
	ready = (async () => {
		try {
			if (!reuse) await buildWebsite();
			build = undefined;
			await reservation.release();
			if (tearingDown) return;
			server = spawnServer(
				WEBSITE,
				[
					'exec',
					'vite',
					'preview',
					'--configLoader',
					'runner',
					'--port',
					String(reservation.port),
					'--strictPort',
				],
				PRODUCTION_ENV,
			);
			await waitForServer(server, `${origin}/`, 30_000);
			await writeReadyState(readyFile!, { ok: true });
		} catch (error) {
			await reservation.release().catch(() => {});
			await writeReadyState(readyFile!, {
				ok: false,
				error: error instanceof Error ? (error.stack ?? error.message) : String(error),
			});
		}
	})();
}

export async function teardown(): Promise<void> {
	// Stop either in-flight process before settling the chain; the flag closes
	// the gap where the build has exited but the preview has not spawned yet.
	tearingDown = true;
	await Promise.all([stopServer(build), stopServer(server)]);
	await ready?.catch(() => {});
	server = undefined;
	build = undefined;
	ready = undefined;
	if (readyFile) await rm(readyFile, { force: true }).catch(() => {});
	readyFile = undefined;
}
