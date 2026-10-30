// The published @pierre/diffs/react declarations with React's types. The
// upstream package has no type suite; typetests/adapted mirrors this file line
// for line against the port.
import type { ReactNode as Renderable } from 'react';
import type {
	CodeView as CodeViewClass,
	CodeViewItem,
	DiffLineAnnotation,
	FileContents,
	FileDiffMetadata,
	Virtualizer as VirtualizerClass,
} from '@pierre/diffs';
import type { WorkerPoolManager } from '@pierre/diffs/worker';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import {
	CodeView,
	FileDiff,
	useFileDiffInstance,
	useVirtualizer,
	useWorkerPool,
	type CodeViewHandle,
	type DiffBasePropsReact,
	type FileDiffProps,
	type FileProps,
	type MultiFileDiffProps,
	type PatchDiffProps,
	type UnresolvedFileProps,
} from '@pierre/diffs/react';

declare const fileDiff: FileDiffMetadata;
declare const file: FileContents;
declare const items: readonly CodeViewItem<string>[];

const handle: { current: CodeViewHandle<string, undefined> | null } = { current: null };
export const codeView = (
	<CodeView<string> ref={handle} items={items} renderAnnotation={() => 'note'} />
);
export const diff = <FileDiff<string> fileDiff={fileDiff} renderHeaderMetadata={() => <span />} />;

export type Checks = [
	Assert<
		Equal<
			ReturnType<CodeViewHandle<string, undefined>['getInstance']>,
			CodeViewClass<string, undefined> | undefined
		>
	>,
	Assert<Equal<FileDiffProps<string, undefined>['fileDiff'], FileDiffMetadata>>,
	Assert<Equal<FileProps<string, undefined>['file'], FileContents>>,
	Assert<Equal<PatchDiffProps<string, undefined>['patch'], string>>,
	Assert<Equal<MultiFileDiffProps<string, undefined>['oldFile'], FileContents | null>>,
	Assert<Equal<UnresolvedFileProps<string>['file'], FileContents>>,
	Assert<Equal<ReturnType<typeof useVirtualizer>, VirtualizerClass | undefined>>,
	Assert<Equal<ReturnType<typeof useWorkerPool>, WorkerPoolManager | undefined>>,
	Assert<
		Equal<ReturnType<typeof useFileDiffInstance<string, undefined>>['fileDiff'], FileDiffMetadata>
	>,
	Assert<
		Equal<
			Parameters<DiffBasePropsReact<string, undefined>['renderAnnotation'] & {}>,
			[annotation: DiffLineAnnotation<string>, fileDiff: FileDiffMetadata]
		>
	>,
	Assert<
		Equal<ReturnType<DiffBasePropsReact<string, undefined>['renderAnnotation'] & {}>, Renderable>
	>,
];

// @ts-expect-error a FileDiff needs its fileDiff
export const missingDiff = <FileDiff />;

// @ts-expect-error controlled and uncontrolled CodeView items are exclusive
export const bothItems = <CodeView items={items} initialItems={items} />;
