// Ported from @pierre/trees 1.0.0-beta.6
// (https://github.com/pierrecomputer/pierre/blob/a90629e0481bb8fed48f36ccb358d5d48a3ae8b6/packages/trees/src/react/useFileTreeSearch.ts),
// Apache-2.0; see LICENSE.upstream and NOTICE.upstream.
//
// Octane adaptations: hooks come from `octane`, the model type from the
// `@pierre/trees` root entry, and the `"use client"` directive is dropped.
// Every dependency array is upstream's.
import type { FileTree } from '@pierre/trees';
import { useMemo } from 'octane';
import { areArraysEqual, useFileTreeSelector } from './useFileTreeSelector.tsrx';

interface FileTreeSearchSnapshot {
	isOpen: boolean;
	matchingPaths: readonly string[];
	value: string;
}

export interface FileTreeSearchState extends FileTreeSearchSnapshot {
	close: () => void;
	focusNextMatch: () => void;
	focusPreviousMatch: () => void;
	open: (initialValue?: string) => void;
	setValue: (value: string | null) => void;
}

function areSearchSnapshotsEqual(
	previous: FileTreeSearchSnapshot,
	next: FileTreeSearchSnapshot,
): boolean {
	return (
		previous.isOpen === next.isOpen &&
		previous.value === next.value &&
		areArraysEqual(previous.matchingPaths, next.matchingPaths)
	);
}

export function useFileTreeSearch(model: FileTree): FileTreeSearchState {
	const snapshot = useFileTreeSelector(
		model,
		(currentModel): FileTreeSearchSnapshot => ({
			isOpen: currentModel.isSearchOpen(),
			matchingPaths: currentModel.getSearchMatchingPaths(),
			value: currentModel.getSearchValue(),
		}),
		areSearchSnapshotsEqual,
	);

	return useMemo(
		() => ({
			...snapshot,
			close: () => {
				model.closeSearch();
			},
			focusNextMatch: () => {
				model.focusNextSearchMatch();
			},
			focusPreviousMatch: () => {
				model.focusPreviousSearchMatch();
			},
			open: (initialValue?: string) => {
				model.openSearch(initialValue);
			},
			setValue: (value: string | null) => {
				model.setSearch(value);
			},
		}),
		[model, snapshot],
	);
}
