export function loadSession(): Promise<string> {
	const fixture = globalThis as typeof globalThis & {
		__opaqueSessionLoad?: () => Promise<string>;
		__opaqueClientLoads?: number;
	};
	if (fixture.__opaqueSessionLoad) return fixture.__opaqueSessionLoad();
	fixture.__opaqueClientLoads = (fixture.__opaqueClientLoads ?? 0) + 1;
	return Promise.reject(new Error('The client unexpectedly started the fixture loader'));
}
