#!/usr/bin/env node

import { rm } from 'node:fs/promises';
import path from 'node:path';
import { createDocusaurusManifest, loadDocusaurusSite, writeDocusaurusManifest } from './index.js';

function usage() {
	return `Usage:
  octane-docusaurus inspect [--site-dir DIR] [--config FILE] [--locale LOCALE] [--out FILE]
  octane-docusaurus clear [--site-dir DIR]

The phase 1-3 command inspects Docusaurus's headless route/data graph. Static
site build, hydration, and theme commands arrive with the renderer phases.
`;
}

function parseArguments(argv) {
	const command = argv[0];
	const options = {};
	for (let index = 1; index < argv.length; index++) {
		const argument = argv[index];
		if (argument === '--allow-unsupported-version') {
			options.allowUnsupportedVersion = true;
			continue;
		}
		if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
		const value = argv[++index];
		if (value === undefined) throw new Error(`Missing value for ${argument}`);
		if (argument === '--site-dir') options.siteDir = value;
		else if (argument === '--config') options.config = value;
		else if (argument === '--locale') options.locale = value;
		else if (argument === '--out') options.out = value;
		else throw new Error(`Unknown option: ${argument}`);
	}
	return { command, options };
}

async function inspect(options) {
	const loaded = await loadDocusaurusSite(options);
	const manifest = await createDocusaurusManifest(loaded);
	if (options.out) {
		const filename = await writeDocusaurusManifest(manifest, options.out);
		process.stdout.write(`${filename}\n`);
	} else {
		process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
	}
}

async function clear(options) {
	const siteDir = path.resolve(options.siteDir ?? process.cwd());
	await Promise.all([
		rm(path.join(siteDir, '.docusaurus'), { recursive: true, force: true }),
		rm(path.join(siteDir, '.octane-docusaurus'), { recursive: true, force: true }),
	]);
}

async function main() {
	const { command, options } = parseArguments(process.argv.slice(2));
	if (command === 'inspect') await inspect(options);
	else if (command === 'clear') await clear(options);
	else {
		process.stderr.write(usage());
		process.exitCode = command === '--help' || command === '-h' ? 0 : 2;
	}
}

main().catch((error) => {
	process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
	process.exitCode = 1;
});
