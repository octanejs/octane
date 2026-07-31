interface Web3IslandObservation {
	activeWatchers: number;
	cleanups: number;
}

const observations = new Map<string, Web3IslandObservation>();

function observation(id: string): Web3IslandObservation {
	let current = observations.get(id);
	if (current === undefined) {
		current = { activeWatchers: 0, cleanups: 0 };
		observations.set(id, current);
	}
	return current;
}

export function watcherAttached(id: string): void {
	observation(id).activeWatchers++;
}

export function watcherDetached(id: string): void {
	observation(id).activeWatchers--;
}

export function islandCleanedUp(id: string): void {
	observation(id).cleanups++;
}

export function readWeb3IslandObservation(id: string): Readonly<Web3IslandObservation> {
	return { ...observation(id) };
}

export function resetWeb3IslandObservation(id: string): void {
	observations.delete(id);
}
