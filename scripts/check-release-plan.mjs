import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import getReleasePlan from '@changesets/get-release-plan';

export function majorReleaseNames(releases) {
	return releases.filter((release) => release.type === 'major').map((release) => release.name);
}

export async function computedMajorReleaseNames(cwd, readReleasePlan = getReleasePlan) {
	const plan = await readReleasePlan(cwd);
	return majorReleaseNames(plan.releases);
}

async function checkReleasePlan() {
	// Read every pending changeset directly. The CLI's `status` command also
	// compares changed packages with a Git base branch, which is unrelated to
	// this guard and rejects valid changeset-exempt tooling or test changes.
	const majors = await computedMajorReleaseNames(process.cwd());

	if (majors.length > 0) {
		console.error('Changesets computed unexpected major releases:');
		for (const name of majors) console.error(`- ${name}`);
		console.error('');
		console.error(
			'For a core beta-line minor bump, expand compatible Octane peer ranges and patch-release those dependents.',
		);
		process.exitCode = 1;
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await checkReleasePlan();
}
