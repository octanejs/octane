export interface DoomProofDescriptor {
	version: number;
	contract: string;
	hasSnapshot: boolean;
	hasShell: boolean;
}

export function requireDoomProof(descriptor: DoomProofDescriptor | null): DoomProofDescriptor {
	if (
		descriptor === null ||
		descriptor.version !== 1 ||
		descriptor.contract !== 'doom-clean-room-v1' ||
		!descriptor.hasSnapshot ||
		!descriptor.hasShell
	) {
		throw new Error('Doom production proof instrumentation is missing or incompatible.');
	}
	return descriptor;
}
