#!/usr/bin/env node

/**
 * octane-preview — Start the production SSR server.
 *
 * Loads octane.config.ts, reads `build.outDir`, and spawns
 * `node {outDir}/server/entry.js` — the self-contained server bundle
 * `vite build` produced. This is the pre-deploy verification step: the exact
 * handler + static assets a production host runs, on localhost.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { loadOctaneConfig } from '../load-config.js';
import { ENTRY_FILENAME } from '../constants.js';

const projectRoot = process.cwd();

// `--port <n>` / `-p <n>` sets the port (else $PORT, else the entry's 3000
// default). `--strictPort` is accepted for `vite preview` muscle-memory and
// ignored — the port is always exact (the entry never probes for a free one).
/** @type {string | undefined} */
let portArg;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
	if (args[i] === '--port' || args[i] === '-p') {
		portArg = args[++i];
	} else if (args[i].startsWith('--port=')) {
		portArg = args[i].slice('--port='.length);
	}
}

try {
	const config = await loadOctaneConfig(projectRoot);
	const outDir = config.build.outDir;
	const entryPath = path.join(projectRoot, outDir, 'server', ENTRY_FILENAME);

	if (!fs.existsSync(entryPath)) {
		console.error(`[octane-preview] Server entry not found: ${entryPath}`);
		console.error('[octane-preview] Did you run `pnpm build` first?');
		process.exit(1);
	}

	console.log(`[octane-preview] Starting server from ${outDir}/server/${ENTRY_FILENAME}`);

	const child = spawn(process.execPath, [entryPath], {
		stdio: 'inherit',
		cwd: projectRoot,
		env: portArg ? { ...process.env, PORT: portArg } : process.env,
	});

	child.on('close', (code) => {
		process.exit(code ?? 0);
	});
} catch (e) {
	const error = /** @type {Error} */ (e);
	console.error('[octane-preview] Failed to load config:', error.message);
	process.exit(1);
}
