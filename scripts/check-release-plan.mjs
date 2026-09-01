import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function majorReleaseNames(releases) {
	return releases.filter((release) => release.type === 'major').map((release) => release.name);
}

export function resolveBaseRef(baseBranch, refExists = defaultRefExists) {
	for (const ref of [baseBranch, `origin/${baseBranch}`]) {
		if (refExists(ref)) return ref;
	}
	throw new Error(`Could not resolve ${baseBranch} or origin/${baseBranch} for the release plan`);
}

function defaultRefExists(ref) {
	return (
		spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], {
			stdio: 'ignore',
		}).status === 0
	);
}

function checkReleasePlan() {
	const directory = mkdtempSync(join(tmpdir(), 'octane-release-plan-'));
	const output = join(directory, 'status.json');
	const config = JSON.parse(readFileSync(resolve('.changeset/config.json'), 'utf8'));
	const baseRef = resolveBaseRef(config.baseBranch);

	try {
		execFileSync(
			resolve('node_modules/.bin/changeset'),
			['status', '--since', baseRef, '--output', output],
			{
				stdio: ['ignore', 'ignore', 'inherit'],
			},
		);
		const plan = JSON.parse(readFileSync(output, 'utf8'));
		const majors = majorReleaseNames(plan.releases);

		if (majors.length > 0) {
			console.error('Changesets computed unexpected major releases:');
			for (const name of majors) console.error(`- ${name}`);
			console.error('');
			console.error(
				'For a core beta-line minor bump, expand compatible Octane peer ranges and patch-release those dependents.',
			);
			process.exitCode = 1;
		}
	} finally {
		rmSync(directory, { force: true, recursive: true });
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	checkReleasePlan();
}
