// A server-rendered tree as the README shows it: the model from useFileTree,
// the preloaded payload, and a stateful header. tests/hydration.test.ts imports
// it for the client and tests/_server.ts compiles the same file for the server.
import type { FileTreeOptions } from '@pierre/trees';
import { useState } from 'octane';
import { FileTree, type FileTreePreloadedData, useFileTree } from '../../src/index.ts';

function HeaderAction() @{
	const [count, setCount] = useState(0);
	<button data-test-header type="button" onClick={() => setCount(count + 1)}>
		{'Header action ' + count}
	</button>
}

export function App(props: { options: FileTreeOptions; preloadedData: FileTreePreloadedData }) @{
	const { model } = useFileTree(props.options);
	<FileTree
		header={<HeaderAction />}
		model={model}
		preloadedData={props.preloadedData}
		style={{ height: '240px' }}
	/>
}
