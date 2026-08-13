import { parseRealmSnapshots } from './analyze.mjs';

function readProfile() {
	const value = globalThis.__OCTANE_LYNX_PROF;
	if (value === undefined) return null;
	const copy = {};
	for (const key of Object.keys(value)) {
		if (typeof value[key] === 'number') copy[key] = value[key];
	}
	return copy;
}

function resetProfile() {
	const profile = globalThis.__OCTANE_LYNX_PROF;
	if (profile === undefined) return;
	for (const key of Object.keys(profile)) profile[key] = 0;
}

export async function realmSnapshots(page) {
	const snapshots = [];
	for (const frame of page.frames()) {
		const profile = await frame.evaluate(readProfile).catch(() => null);
		if (profile !== null) snapshots.push({ kind: 'frame', profile });
	}
	for (const worker of page.workers()) {
		const profile = await worker.evaluate(readProfile).catch(() => null);
		if (profile !== null) snapshots.push({ kind: 'worker', profile });
	}
	return parseRealmSnapshots(snapshots);
}

export async function resetProfiles(page) {
	await Promise.all([
		...page.frames().map((frame) => frame.evaluate(resetProfile).catch(() => {})),
		...page.workers().map((worker) => worker.evaluate(resetProfile).catch(() => {})),
	]);
}
