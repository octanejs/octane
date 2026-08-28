import { useSyncExternalStore } from './react-deps';
import { optionAndSlot, subSlot } from './internal';
import type { Path } from './location-hook';

const listeners: { v: Array<() => void> } = {
	v: [],
};

const onHashChange = () => listeners.v.forEach((callback) => callback());

const subscribeToHashUpdates = (callback: () => void) => {
	if (listeners.v.push(callback) === 1) {
		addEventListener('hashchange', onHashChange);
	}

	return () => {
		listeners.v = listeners.v.filter((item) => item !== callback);
		if (!listeners.v.length) {
			removeEventListener('hashchange', onHashChange);
		}
	};
};

const currentHashLocation = () => '/' + location.hash.replace(/^#?\/?/, '');

export function navigate<S = any>(
	to: Path,
	options?: { state?: S; replace?: boolean; transition?: boolean },
): void;
export function navigate<S = any>(
	to: Path,
	{
		state = null,
		replace = false,
	}: { state?: S | null; replace?: boolean; transition?: boolean } = {},
): void {
	const oldURL = location.href;
	const [hash, search] = to.replace(/^#?\/?/, '').split('?');
	const url = new URL(location.href);
	url.hash = `/${hash}`;
	if (search) {
		url.search = search;
	}
	const newURL = url.href;

	if (replace) {
		history.replaceState(state, '', newURL);
	} else {
		history.pushState(state, '', newURL);
	}

	const event =
		typeof HashChangeEvent !== 'undefined'
			? new HashChangeEvent('hashchange', { oldURL, newURL })
			: new Event('hashchange');

	dispatchEvent(event);
}

export function useHashLocation(options?: { ssrPath?: Path }): [Path, typeof navigate];
export function useHashLocation(
	first: { ssrPath?: Path } | symbol = {},
	second?: symbol,
): [Path, typeof navigate] {
	const [{ ssrPath = '/' }, slot] = optionAndSlot(first, second);
	return [
		useSyncExternalStore(
			subscribeToHashUpdates,
			currentHashLocation,
			() => ssrPath,
			subSlot(slot, 'hash-location'),
		),
		navigate,
	];
}

useHashLocation.hrefs = (href: string) => '#' + href;
