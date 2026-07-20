#!/usr/bin/env node
/**
 * Link local packages in parallel for faster dev startup
 */

import { spawn } from 'node:child_process';

const packages = [
	'../create-tsrouter-app/packages/cta-engine',
	'../create-tsrouter-app/frameworks/react-cra',
	'../create-tsrouter-app/frameworks/solid',
];

async function linkPackage(pkg) {
	return new Promise((resolve, reject) => {
		const proc = spawn('pnpm', ['link', pkg], { stdio: 'inherit' });
		proc.on('close', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`Failed to link ${pkg}`));
		});
		proc.on('error', reject);
	});
}

try {
	await Promise.all(packages.map(linkPackage));
} catch (e) {
	console.error(e.message);
	process.exit(1);
}
