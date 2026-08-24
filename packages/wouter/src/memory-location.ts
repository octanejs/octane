import mitt from 'mitt';
import { useSyncExternalStore } from './react-deps';
import { optionAndSlot, subSlot } from './internal';
import type { BaseLocationHook, BaseSearchHook, Path, SearchString } from './location-hook';

type Navigate<S = any> = (
	to: Path,
	options?: { replace?: boolean; state?: S; transition?: boolean },
) => void;

type MemoryLocationResult<S> = {
	hook: BaseLocationHook;
	searchHook: BaseSearchHook;
	navigate: Navigate<S>;
	readonly state: S | null;
};

type RecordedMemoryLocation = {
	history: Path[];
	reset: () => void;
};

export function memoryLocation<S = unknown>(options?: {
	path?: Path;
	searchPath?: SearchString;
	state?: S;
	static?: boolean;
	record?: false;
}): MemoryLocationResult<S>;
export function memoryLocation<S = unknown>(options: {
	path?: Path;
	searchPath?: SearchString;
	state?: S;
	static?: boolean;
	record: true;
}): MemoryLocationResult<S> & RecordedMemoryLocation;
export function memoryLocation<S = unknown>({
	path = '/',
	searchPath = '',
	state = null,
	static: staticLocation,
	record,
}: {
	path?: Path;
	searchPath?: SearchString;
	state?: S | null;
	static?: boolean;
	record?: boolean;
} = {}): MemoryLocationResult<S> & Partial<RecordedMemoryLocation> {
	let initialPath = path;
	const initialState = state;
	if (searchPath) {
		initialPath += path.split('?')[1] ? '&' : '?';
		initialPath += searchPath;
	}

	let [currentPath, currentSearch = ''] = initialPath.split('?');
	let currentState = initialState;
	const history = [initialPath];
	const emitter = mitt<{ navigate: string }>();

	const navigateImplementation: Navigate<S> = (
		nextPath,
		{ replace = false, state: nextState } = {},
	) => {
		if (record) {
			if (replace) {
				history.splice(history.length - 1, 1, nextPath);
			} else {
				history.push(nextPath);
			}
		}

		[currentPath, currentSearch = ''] = nextPath.split('?');
		if (nextState !== undefined) {
			currentState = nextState;
		}
		emitter.emit('navigate', nextPath);
	};

	const navigate: Navigate<S> = !staticLocation ? navigateImplementation : () => undefined;

	const subscribe = (callback: () => void) => {
		emitter.on('navigate', callback);
		return () => emitter.off('navigate', callback);
	};

	function useMemoryLocation(first?: object | symbol, second?: symbol): [Path, Navigate<S>] {
		const [, slot] = optionAndSlot(first, second);
		return [
			useSyncExternalStore(
				subscribe,
				() => currentPath,
				() => currentPath,
				subSlot(slot, 'memory-location'),
			),
			navigate,
		];
	}

	function useMemoryQuery(first?: object | symbol, second?: symbol): SearchString {
		const [, slot] = optionAndSlot(first, second);
		return useSyncExternalStore(
			subscribe,
			() => currentSearch,
			() => currentSearch,
			subSlot(slot, 'memory-search'),
		);
	}

	useMemoryLocation.searchHook = useMemoryQuery;

	function reset() {
		history.splice(0, history.length);
		navigateImplementation(initialPath, { state: initialState as S });
	}

	const result: MemoryLocationResult<S> & Partial<RecordedMemoryLocation> = {
		hook: useMemoryLocation,
		searchHook: useMemoryQuery,
		navigate,
		history: record ? history : undefined,
		reset: record ? reset : undefined,
		get state() {
			return currentState;
		},
	};

	return result;
}
