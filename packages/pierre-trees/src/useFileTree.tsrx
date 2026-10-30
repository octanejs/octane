// Ported from @pierre/trees 1.0.0-beta.6
// (https://github.com/pierrecomputer/pierre/blob/a90629e0481bb8fed48f36ccb358d5d48a3ae8b6/packages/trees/src/react/useFileTree.ts),
// Apache-2.0; see LICENSE.upstream and NOTICE.upstream.
//
// Octane adaptations: hooks come from `octane`, the model and its options from
// the `@pierre/trees` root entry, and the `"use client"` directive is dropped.
// The explicit dependency array is upstream's.
import { FileTree, type FileTreeOptions } from '@pierre/trees';
import { useEffect, useRef, useState } from 'octane';

interface CleanUpRef {
	timeout: ReturnType<typeof setTimeout> | null;
	model: FileTree;
}

export interface UseFileTreeResult {
	model: FileTree;
}

// Creates the model exactly once so callers have a stable imperative runtime.
// Later option changes are intentionally ignored; callers must use explicit
// model methods like resetPaths and setComposition.
export function useFileTree(options: FileTreeOptions): UseFileTreeResult {
	const [model] = useState(() => new FileTree(options));
	const cleanUpRef = useRef<CleanUpRef>({ timeout: null, model });
	useEffect(() => {
		const { current } = cleanUpRef;
		// Upstream defers the clean up a cycle so React's StrictMode effect
		// replay keeps the instance; a remount within that cycle cancels it.
		if (current.timeout != null) {
			clearTimeout(current.timeout);
			current.timeout = null;
		}
		return () => {
			current.timeout = setTimeout(() => current.model.cleanUp(), 1);
		};
	}, []);
	return { model };
}
