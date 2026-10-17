import { parseHref } from '@tanstack/history';

type NavigationWindow = Window & {
	navigation?: {
		currentEntry?: { key: string; getState(): unknown } | null;
		updateCurrentEntry(options: { state: unknown }): void;
	};
};

export function prepareInitialHistoryState(
	win: NavigationWindow | undefined = typeof document === 'undefined' ? undefined : window,
): void {
	if (!win) return;
	const state = win.history.state;
	if (state?.__TSR_key || state?.key) return;

	const navigation = win.navigation;
	const entry = navigation?.currentEntry;
	const navigationState =
		entry && typeof navigation?.updateCurrentEntry === 'function' ? entry.getState() : undefined;
	if (state == null && navigationState === undefined) return;
	const entryKey = entry?.key;

	// Seed TanStack's metadata before its constructor replaces the entry. The
	// History API and Navigation API store independent state for the same entry.
	const metadata = parseHref('/', undefined).state;
	win.history.replaceState(
		{ ...state, ...metadata, __TSR_index: state?.__TSR_index ?? metadata.__TSR_index },
		'',
	);
	if (navigation && navigationState !== undefined) {
		const currentEntry = navigation.currentEntry;
		if (currentEntry && currentEntry.key === entryKey && currentEntry.getState() === undefined) {
			navigation.updateCurrentEntry({ state: navigationState });
		}
	}
}
