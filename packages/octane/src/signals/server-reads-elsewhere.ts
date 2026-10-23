/** A browser bundle never renders on the server (server-reads.ts). */
export function installServerReads(): void {}

export function runAsDeclaredServerSignalReader<T>(_owner: unknown, read: () => T): T {
	return read();
}

export function serverSignalQueryAttemptObserver(_scopeKey: string): undefined {
	return undefined;
}

export function hasServerSignalQueryAttemptObserver(_scopeKey: string): boolean {
	return false;
}

export function captureCurrentServerSignalQueryAttemptObserver(_scopeKey: string): undefined {
	return undefined;
}
