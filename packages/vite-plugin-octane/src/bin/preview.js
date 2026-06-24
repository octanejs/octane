#!/usr/bin/env node

/**
 * octane-preview — Start the production SSR server.
 *
 * Loads octane.config.ts, reads `build.outDir`,
 * and spawns `node {outDir}/server/entry.js`.
 *
 * NOTE: the server entry it spawns is produced by the Phase 2 production
 * build. Until then this validates existence and errors clearly.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { loadOctaneConfig } from '../load-config.js';
import { ENTRY_FILENAME } from '../constants.js';

const projectRoot = process.cwd();

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
	});

	child.on('close', (code) => {
		process.exit(code ?? 0);
	});
} catch (e) {
	const error = /** @type {Error} */ (e);
	console.error('[octane-preview] Failed to load config:', error.message);
	process.exit(1);
}
