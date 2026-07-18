// A tab left open across a deployment can still request route chunks from the
// previous build. Vite reports those failures through `vite:preloadError`;
// reload once so the tab picks up the current document and asset manifest.
export const RELOAD_RETRY_WINDOW_MS = 10_000;

interface ReloadHost {
	addEventListener(type: string, listener: (event: Event) => void): void;
	location: { href: string; reload(): void };
	sessionStorage: Pick<Storage, 'getItem' | 'setItem'>;
}

export function installStaleChunkReload(host: ReloadHost): void {
	let reloadScheduled = false;
	host.addEventListener('vite:preloadError', (event) => {
		if (reloadScheduled) {
			event.preventDefault();
			return;
		}
		const key = 'octane:preload-error-reload';
		const now = Date.now();
		try {
			const last = JSON.parse(host.sessionStorage.getItem(key) ?? 'null');
			if (last?.href === host.location.href && now - last.time < RELOAD_RETRY_WINDOW_MS) {
				return;
			}
			host.sessionStorage.setItem(key, JSON.stringify({ href: host.location.href, time: now }));
		} catch {
			return;
		}
		reloadScheduled = true;
		event.preventDefault();
		host.location.reload();
	});
}

if (typeof window !== 'undefined') {
	installStaleChunkReload(window);
}
