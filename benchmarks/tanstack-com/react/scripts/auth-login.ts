#!/usr/bin/env tsx
/**
 * TanStack CLI Auth Login
 *
 * Opens a browser for OAuth on tanstack.com, mints a session token,
 * and saves it as DEV_SESSION_TOKEN in .env.local for local development.
 *
 * Usage:
 *   pnpm auth:login
 *   pnpm auth:login --url http://localhost:3000   # auth against local server
 */

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const urlFlagIdx = args.indexOf('--url');
const BASE_URL =
	urlFlagIdx !== -1 && args[urlFlagIdx + 1] ? args[urlFlagIdx + 1] : 'https://tanstack.com';

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const ENV_FILE = resolve(process.cwd(), '.env.local');
const ENV_KEY = 'DEV_SESSION_TOKEN';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function openBrowser(url: string) {
	const platform = process.platform;
	const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
	spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
}

function upsertEnvFile(key: string, value: string) {
	let contents = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
	const line = `${key}=${value}`;
	const pattern = new RegExp(`^${key}=.*$`, 'm');

	if (pattern.test(contents)) {
		contents = contents.replace(pattern, line);
	} else {
		contents =
			contents.endsWith('\n') || contents === ''
				? contents + line + '\n'
				: contents + '\n' + line + '\n';
	}

	writeFileSync(ENV_FILE, contents, 'utf8');
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
	const res = await fetch(url, options);
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} from ${url}`);
	}
	return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

async function main() {
	console.log(`\nAuthenticating with ${BASE_URL}...\n`);

	// 1. Create a ticket
	const { ticketId } = await fetchJson<{ ticketId: string }>(
		`${BASE_URL}/api/auth/cli/create-ticket`,
		{ method: 'POST' },
	);

	// 2. Open browser
	const authUrl = `${BASE_URL}/auth/cli?ticket=${ticketId}`;
	console.log(`Opening browser to:\n  ${authUrl}\n`);
	console.log('Waiting for you to complete sign-in...');
	openBrowser(authUrl);

	// 3. Poll for authorization
	const deadline = Date.now() + TIMEOUT_MS;
	while (Date.now() < deadline) {
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

		const result = await fetchJson<
			{ authorized: false } | { authorized: true; sessionToken: string } | { error: string }
		>(`${BASE_URL}/api/auth/cli/status/${ticketId}`).catch(() => null);

		if (!result) continue;

		if ('error' in result) {
			console.error(`\nError: ${result.error}`);
			process.exit(1);
		}

		if (result.authorized) {
			// 4. Save token
			upsertEnvFile(ENV_KEY, result.sessionToken);
			console.log(`\nSuccess! Token saved to .env.local as ${ENV_KEY}.`);
			console.log('Restart your dev server to pick up the new session.\n');
			process.exit(0);
		}
	}

	console.error('\nTimed out waiting for authorization. Please try again.');
	process.exit(1);
}

main().catch((err) => {
	console.error('\nFailed:', err instanceof Error ? err.message : err);
	process.exit(1);
});
