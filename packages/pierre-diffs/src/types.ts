import type { CSSProperties, OctaneNode } from 'octane';

import type {
	DiffLineAnnotation,
	FileOptions as FileClassOptions,
	FileContents,
	FileDiffEditChangeHandler,
	FileDiffEditCompleteHandler,
	FileDiffMetadata,
	FileDiffOptions as FileDiffClassOptions,
	FileEditChangeHandler,
	FileEditCompleteHandler,
	GetHoveredLineResult,
	LineAnnotation,
	SelectedLineRange,
	VirtualFileMetrics,
} from '@pierre/diffs';
import type { EditorOptions } from '@pierre/diffs/edit';

type ReactOwnedEditCallbacks = 'onEditChange' | 'onEditComplete';

export type FileDiffOptions<LAnnotation, Caret> = Omit<
	FileDiffClassOptions<LAnnotation, Caret>,
	ReactOwnedEditCallbacks
>;

export type FileOptions<LAnnotation, Caret> = Omit<
	FileClassOptions<LAnnotation, Caret>,
	ReactOwnedEditCallbacks
>;

export interface DiffBasePropsReact<LAnnotation, Caret> {
	options?: FileDiffOptions<LAnnotation, Caret>;
	/** Whether this surface has an active edit session. */
	edit?: boolean;
	/** Creation-time options passed to the nearest EditProvider factory. */
	editorOptions?: EditorOptions<'file-diff', LAnnotation, Caret>;
	/** Retain this editable draft and its undo/redo history in memory. */
	editStateKey?: string;
	/**
	 * Fired for every document change of an active edit session, with the same
	 * `EditorChangeEvent` the editor reports through its own `onChange`. Don't
	 * feed this data back into the component.
	 *
	 * When editing a diff, you are editing the contents of the new file. You
	 * cannot edit the contents of the old file. You are not getting back an
	 * update `fileDiff` during this edit session.
	 */
	onEditChange?: FileDiffEditChangeHandler<LAnnotation, Caret>;
	/**
	 * Fired when `edit` toggles false or the component unmounts. Return `'accept'`
	 * to install the completed diff and annotations or `'reject'` to restore the
	 * external values. The event contains the detached editor with its final
	 * state.
	 */
	onEditComplete?: FileDiffEditCompleteHandler<LAnnotation, Caret>;
	metrics?: VirtualFileMetrics;
	lineAnnotations?: DiffLineAnnotation<LAnnotation>[];
	selectedLines?: SelectedLineRange | null;
	/** Receives the matching diff. */
	renderAnnotation?(
		annotation: DiffLineAnnotation<LAnnotation>,
		fileDiff: FileDiffMetadata,
	): OctaneNode;
	renderCustomHeader?(fileDiff: FileDiffMetadata): OctaneNode;
	renderHeaderPrefix?(fileDiff: FileDiffMetadata): OctaneNode;
	renderHeaderFilenameSuffix?(fileDiff: FileDiffMetadata): OctaneNode;
	renderHeaderMetadata?(fileDiff: FileDiffMetadata): OctaneNode;
	renderGutterUtility?(getHoveredLine: () => GetHoveredLineResult<'diff'> | undefined): OctaneNode;
	className?: string;
	style?: CSSProperties;
	prerenderedHTML?: string;
}

export interface FileProps<LAnnotation, Caret> {
	file: FileContents;
	options?: FileOptions<LAnnotation, Caret>;
	/** Whether this surface has an active edit session. */
	edit?: boolean;
	/** Creation-time options passed to the nearest EditProvider factory. */
	editorOptions?: EditorOptions<'file', LAnnotation, Caret>;
	/** Retain this editable draft and its undo/redo history in memory. */
	editStateKey?: string;
	/**
	 * Fired for every document change of an active edit session, with the same
	 * `EditorChangeEvent` the editor reports through its own `onChange`. Don't
	 * feed this data back into the component.
	 */
	onEditChange?: FileEditChangeHandler<LAnnotation, Caret>;
	/**
	 * Fired when `edit` toggles false or the component unmounts. Return `'accept'`
	 * to install the completed file and annotations or `'reject'` to restore the
	 * external values. The event contains the detached editor with its final
	 * state.
	 */
	onEditComplete?: FileEditCompleteHandler<LAnnotation, Caret>;
	metrics?: VirtualFileMetrics;
	lineAnnotations?: LineAnnotation<LAnnotation>[];
	selectedLines?: SelectedLineRange | null;
	/** Receives the matching file. */
	renderAnnotation?(annotation: LineAnnotation<LAnnotation>, file: FileContents): OctaneNode;
	renderCustomHeader?(file: FileContents): OctaneNode;
	renderHeaderPrefix?(file: FileContents): OctaneNode;
	renderHeaderFilenameSuffix?(file: FileContents): OctaneNode;
	renderHeaderMetadata?(file: FileContents): OctaneNode;
	renderGutterUtility?(getHoveredLine: () => GetHoveredLineResult<'file'> | undefined): OctaneNode;
	className?: string;
	style?: CSSProperties;
	prerenderedHTML?: string;
	disableWorkerPool?: boolean;
}
