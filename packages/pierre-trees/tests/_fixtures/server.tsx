/** @jsxImportSource octane */
// Server-compiled twins of the upstream suite's SSR components
// (upstream/test/file-tree-react.test.tsx). Each factory holds one case's
// components as upstream declares them, inside a function, so they compile to the
// markup the client components hydrate; the case's values are its parameters.
import type { FileTree as FileTreeModel, FileTreeOptions } from '@pierre/trees';
import { useState } from 'octane';
import {
	FileTree as FileTreeReact,
	type FileTreePreloadedData,
	useFileTree,
} from '../../src/index.ts';

/** "hydrates preloadedData without a client/server mismatch". */
export function preloadedHarness(model: FileTreeModel, preloadedData: FileTreePreloadedData) {
	function Harness() {
		return (
			<FileTreeReact
				header={<button data-test-hydration-header>Header action</button>}
				model={model}
				preloadedData={preloadedData}
			/>
		);
	}

	return { Harness };
}

/** "hydrates colocated preloadedData and preserves live header interactions". */
export function colocatedHarness(options: FileTreeOptions, preloadedData: FileTreePreloadedData) {
	function HeaderAction() {
		const [count, setCount] = useState(0);
		return (
			<button
				data-test-ssr-header
				onClick={() => {
					setCount((previousCount) => previousCount + 1);
				}}
				type="button"
			>
				Header action {count}
			</button>
		);
	}

	function Harness() {
		const { model } = useFileTree(options);

		return <FileTreeReact header={<HeaderAction />} model={model} preloadedData={preloadedData} />;
	}

	return { Harness };
}
