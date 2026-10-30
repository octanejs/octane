// Ported from @pierre/trees 1.0.0-beta.6
// (https://github.com/pierrecomputer/pierre/blob/a90629e0481bb8fed48f36ccb358d5d48a3ae8b6/packages/trees/src/react/useFileTreeSelection.ts),
// Apache-2.0; see LICENSE.upstream and NOTICE.upstream.
//
// Octane adaptations: the model type comes from the `@pierre/trees` root entry
// and the `"use client"` directive is dropped.
import type { FileTree } from '@pierre/trees';
import { areArraysEqual, useFileTreeSelector } from './useFileTreeSelector.tsrx';

export function useFileTreeSelection(model: FileTree): readonly string[] {
	return useFileTreeSelector(
		model,
		(currentModel) => currentModel.getSelectedPaths(),
		areArraysEqual,
	);
}
