import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'octane';
import { splitSlot, subSlot } from '../../internal';
import { getStorageKey } from './auto-save/getStorageKey';
import { readLegacyLayout } from './auto-save/readLegacyLayout';
import type { Layout, LayoutChangedMeta, LayoutStorage } from './types';

type UseDefaultLayoutOptions = {
	debounceSaveMs?: number;
	onlySaveAfterUserInteractions?: boolean;
	panelIds?: string[];
	storage?: LayoutStorage;
} & ({ groupId: string } | { id: string });

export function useDefaultLayout(options: UseDefaultLayoutOptions, ...rest: [symbol?]) {
	const [args, slot] = splitSlot(rest);
	if (args.length !== 0) throw new TypeError('useDefaultLayout() accepts one options argument.');
	const {
		debounceSaveMs = 100,
		onlySaveAfterUserInteractions,
		panelIds,
		storage: storageProp,
		...identity
	} = options;
	const id = 'id' in identity ? identity.id : identity.groupId;
	const hasPanelIds = panelIds !== undefined;
	const storage = resolveStorage(storageProp);
	const readStorageKey = getStorageKey(id, panelIds ?? []);
	// Match upstream: the same storage read runs on server and client so
	// cookie/DB-backed LayoutStorage can restore during SSR. Client-only APIs
	// (implicit localStorage) resolve to undefined on the server via
	// resolveStorage, so the snapshot stays null without a custom storage prop.
	const defaultLayoutString = useSyncExternalStore(
		subscribe,
		() => readDefaultLayoutString(storage, readStorageKey, id, panelIds),
		() => readDefaultLayoutString(storage, readStorageKey, id, panelIds),
		subSlot(slot, 'stored-layout'),
	);
	const defaultLayout = useMemo(
		() => readModernLayout(defaultLayoutString),
		[defaultLayoutString],
		subSlot(slot, 'default-layout'),
	);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null, subSlot(slot, 'timeout'));
	const storageRef = useRef<LayoutStorage | undefined>(storage, subSlot(slot, 'storage'));
	storageRef.current = storage;

	const clearPendingTimeout = useCallback(
		() => {
			if (timeoutRef.current !== null) {
				clearTimeout(timeoutRef.current);
				timeoutRef.current = null;
			}
		},
		[],
		subSlot(slot, 'clear-timeout'),
	);

	useEffect(() => clearPendingTimeout, [clearPendingTimeout], subSlot(slot, 'cleanup-effect'));

	const onLayoutChanged = useCallback<(layout: Layout, meta: LayoutChangedMeta) => void>(
		(layout: Layout, meta: LayoutChangedMeta) => {
			if (onlySaveAfterUserInteractions && !meta.isUserInteraction) return;
			clearPendingTimeout();

			const storage = storageRef.current;
			if (!storage) return;
			const key = getStorageKey(id, hasPanelIds ? Object.keys(layout) : []);
			try {
				storage.setItem(key, JSON.stringify(layout));
			} catch (error) {
				console.error(error);
			}
		},
		[clearPendingTimeout, hasPanelIds, id, onlySaveAfterUserInteractions],
		subSlot(slot, 'layout-changed'),
	);

	const onLayoutChange = useCallback<(layout: Layout) => void>(
		(layout: Layout) => {
			clearPendingTimeout();
			if (debounceSaveMs === 0) {
				onLayoutChanged(layout, { isUserInteraction: false });
			} else {
				timeoutRef.current = setTimeout(
					() => onLayoutChanged(layout, { isUserInteraction: false }),
					debounceSaveMs,
				);
			}
		},
		[clearPendingTimeout, debounceSaveMs, onLayoutChanged],
		subSlot(slot, 'layout-change'),
	);

	return { defaultLayout, onLayoutChange, onLayoutChanged };
}

function subscribe() {
	return () => {};
}

function resolveStorage(storage: LayoutStorage | undefined): LayoutStorage | undefined {
	if (storage) return storage;
	try {
		return globalThis.localStorage;
	} catch {
		return undefined;
	}
}

function readStorageItem(storage: LayoutStorage | undefined, key: string): string | null {
	if (!storage) return null;
	try {
		return storage.getItem(key);
	} catch {
		return null;
	}
}

function readDefaultLayoutString(
	storage: LayoutStorage | undefined,
	modernKey: string,
	id: string,
	panelIds: readonly string[] | undefined,
): string | null {
	const modernString = readStorageItem(storage, modernKey);
	if (readModernLayout(modernString)) return modernString;
	if (!storage) return null;
	try {
		const legacy = readLegacyLayout({ id, panelIds, storage });
		return legacy ? JSON.stringify(legacy) : null;
	} catch {
		return null;
	}
}

function readModernLayout(value: string | null): Layout | undefined {
	if (!value) return undefined;
	try {
		const parsed: unknown = JSON.parse(value);
		if (
			parsed !== null &&
			typeof parsed === 'object' &&
			!Array.isArray(parsed) &&
			Object.values(parsed).every((item) => typeof item === 'number')
		) {
			return parsed as Layout;
		}
	} catch {
		// Malformed modern records fall through to the legacy reader.
	}
	return undefined;
}
