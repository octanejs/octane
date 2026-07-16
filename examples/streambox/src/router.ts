import type { WatchPanel, WatchRoute } from './types';

const WATCH_ROUTE = /^\/watch\/([^/]+)(?:\/(comments|transcript))?\/?$/;

export function watchURL(videoId: string, panel: WatchPanel = 'overview'): string {
	const suffix = panel === 'overview' ? '' : `/${panel}`;
	return `/watch/${encodeURIComponent(videoId)}${suffix}${window.location.search}`;
}

export function readWatchRoute(location: Pick<Location, 'pathname'> = window.location): WatchRoute {
	const match = WATCH_ROUTE.exec(location.pathname);
	return {
		videoId: match ? decodeURIComponent(match[1]) : 'neon-tides',
		panel: (match?.[2] as WatchPanel | undefined) ?? 'overview',
	};
}
