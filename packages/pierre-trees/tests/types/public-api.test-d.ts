import {
	FileTree as FileTreeModel,
	type ContextMenuItem,
	type ContextMenuOpenContext,
	type FileTreeOptions,
	type FileTreeSsrPayload,
} from '@pierre/trees';
import type { CSSProperties, OctaneNode } from 'octane';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import {
	FileTree,
	useFileTree,
	useFileTreeSearch,
	useFileTreeSelection,
	useFileTreeSelector,
	type FileTreePreloadedData,
	type FileTreeProps,
	type FileTreeSearchState,
	type FileTreeSelector,
	type FileTreeSelectorEquality,
	type UseFileTreeResult,
} from '@octanejs/pierre-trees';

const options: FileTreeOptions = { paths: ['README.md', 'src/index.ts'], search: true };
const tree = useFileTree(options);
const selection = useFileTreeSelection(tree.model);
const search = useFileTreeSearch(tree.model);
const focused = useFileTreeSelector(tree.model, (model) => model.getFocusedPath());
const count = useFileTreeSelector(
	tree.model,
	(model) => model.getSelectedPaths().length,
	(previous, next) => previous === next,
);
const props: FileTreeProps = {
	model: tree.model,
	className: 'tree',
	'aria-label': 'Files',
	header: 'Files',
	preloadedData: { id: 'tree', shadowHtml: '' },
	renderContextMenu: (item, context) => (context.close(), item.path),
	style: { height: '320px' },
	onClickCapture: (event) => event.composedPath(),
};

export type Checks = [
	Assert<Equal<typeof tree, UseFileTreeResult>>,
	Assert<Equal<UseFileTreeResult['model'], FileTreeModel>>,
	Assert<Equal<Parameters<typeof useFileTree>, [options: FileTreeOptions]>>,
	Assert<Equal<typeof selection, readonly string[]>>,
	Assert<Equal<typeof search, FileTreeSearchState>>,
	Assert<Equal<FileTreeSearchState['matchingPaths'], readonly string[]>>,
	Assert<Equal<FileTreeSearchState['open'], (initialValue?: string) => void>>,
	Assert<Equal<FileTreeSearchState['setValue'], (value: string | null) => void>>,
	Assert<Equal<typeof focused, string | null>>,
	Assert<Equal<typeof count, number>>,
	Assert<Equal<FileTreeSelector<number>, (model: FileTreeModel) => number>>,
	Assert<Equal<FileTreeSelectorEquality<number>, (previous: number, next: number) => boolean>>,
	Assert<Equal<FileTreePreloadedData, Pick<FileTreeSsrPayload, 'id' | 'shadowHtml'>>>,
	Assert<Equal<FileTreeProps['model'], FileTreeModel>>,
	Assert<Equal<FileTreeProps['header'], OctaneNode | undefined>>,
	Assert<Equal<FileTreeProps['style'], CSSProperties | undefined>>,
	Assert<
		Equal<
			FileTreeProps['renderContextMenu'],
			((item: ContextMenuItem, context: ContextMenuOpenContext) => OctaneNode) | undefined
		>
	>,
	Assert<Equal<Parameters<typeof FileTree>, [FileTreeProps]>>,
];

export const element = FileTree(props);

// @ts-expect-error FileTree requires a model
export const missingModel: FileTreeProps = { className: 'tree' };

// @ts-expect-error style is an object, which FileTree merges with its density variables
export const stringStyle: FileTreeProps = { model: tree.model, style: 'height: 320px' };

// @ts-expect-error FileTree renders its own children: the header and context-menu slots
export const children: FileTreeProps = { model: tree.model, children: 'nested' };

// @ts-expect-error a selector receives the model
useFileTreeSelector(tree.model, (model: string) => model);

const sameNumber = (previous: number, next: number) => previous === next;
// @ts-expect-error the equality function compares selected values
useFileTreeSelector(tree.model, (model) => model.getFocusedPath(), sameNumber);

// @ts-expect-error useFileTree takes the model's options
useFileTree({ paths: 'README.md' });
