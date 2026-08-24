import type { Layout, LayoutStorage } from '../types';
import { getStorageKey } from './getStorageKey';

type LegacyLayout = Record<string, { expandToSizes: unknown; layout: number[] }>;

export function readLegacyLayout({
	id,
	panelIds,
	storage,
}: {
	id: string;
	panelIds?: readonly string[];
	storage: LayoutStorage;
}): Layout | undefined {
	const value = storage.getItem(getStorageKey(id, []));
	if (!value) return undefined;

	try {
		const legacy = JSON.parse(value) as LegacyLayout;
		const ids = panelIds ?? getOnlyLegacyPanelIds(legacy);
		if (!ids) return undefined;

		const entry = legacy[ids.join(',')];
		if (!entry || !Array.isArray(entry.layout) || ids.length !== entry.layout.length) {
			return undefined;
		}

		return Object.fromEntries(ids.map((panelId, index) => [panelId, entry.layout[index]]));
	} catch {
		return undefined;
	}
}

function getOnlyLegacyPanelIds(legacy: LegacyLayout): string[] | undefined {
	const keys = Object.keys(legacy);
	return keys.length === 1 ? keys[0].split(',') : undefined;
}
