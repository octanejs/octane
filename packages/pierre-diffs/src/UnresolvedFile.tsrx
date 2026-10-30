import type { OctaneNode } from 'octane';

import type {
	DiffHunksRendererOptions,
	FileContents,
	HunkSeparators,
	MergeConflictResolution,
	PostRenderPhase,
	UnresolvedFile as UnresolvedFileClass,
} from '@pierre/diffs';
import { type MergeConflictDiffAction } from './core/parseMergeConflictDiffFromFile';
import type { FileDiffProps } from './FileDiff.tsrx';
import type { FileDiffOptions } from './types';
import { renderDiffChildren } from './utils/renderDiffChildren.tsrx';
import { templateRender } from './utils/templateRender.tsrx';
import { useUnresolvedFileInstance } from './utils/useUnresolvedFileInstance';

// @pierre/diffs does not export this renderer option type.
interface UnresolvedFileHunksRendererOptions extends DiffHunksRendererOptions {
	mergeConflictActionsType?: 'none' | 'default' | 'custom';
}

export interface RenderMergeConflictActionContext {
	resolveConflict(resolution: MergeConflictResolution): void;
}

export type RenderMergeConflictActions = (
	action: MergeConflictDiffAction,
	context: RenderMergeConflictActionContext,
) => OctaneNode;

export type MergeConflictActionsTypeOption = 'none' | 'default' | RenderMergeConflictActions;

export interface UnresolvedFileReactOptions<LAnnotation>
	extends
		Omit<
			FileDiffOptions<LAnnotation, undefined>,
			'hunkSeparators' | 'diffStyle' | 'onMergeConflictAction' | 'onPostRender'
		>,
		UnresolvedFileHunksRendererOptions {
	hunkSeparators?: HunkSeparators;
	onPostRender?(
		node: HTMLElement,
		instance: UnresolvedFileClass<LAnnotation>,
		phase: PostRenderPhase,
	): unknown;
	maxContextLines?: number;
}

export interface UnresolvedFileProps<LAnnotation> extends Omit<
	FileDiffProps<LAnnotation, undefined>,
	'fileDiff' | 'options' | 'edit' | 'editorOptions' | 'onEditChange' | 'onEditComplete'
> {
	file: FileContents;
	options?: UnresolvedFileReactOptions<LAnnotation>;
	renderMergeConflictUtility?(
		action: MergeConflictDiffAction,
		getInstance: () => UnresolvedFileClass<LAnnotation> | undefined,
	): OctaneNode;
	disableWorkerPool?: boolean;
}

export function UnresolvedFile<LAnnotation = undefined>({
	file,
	options,
	lineAnnotations,
	selectedLines,
	className,
	style,
	prerenderedHTML,
	renderAnnotation,
	renderCustomHeader,
	renderHeaderPrefix,
	renderHeaderFilenameSuffix,
	renderHeaderMetadata,
	renderGutterUtility,
	renderMergeConflictUtility,
	disableWorkerPool = false,
}: UnresolvedFileProps<LAnnotation>): OctaneNode {
	const {
		ref,
		getHoveredLine,
		fileDiff,
		actions,
		getInstance,
		lineAnnotations: renderedAnnotations,
	} = useUnresolvedFileInstance({
		file,
		options,
		lineAnnotations,
		selectedLines,
		prerenderedHTML,
		hasConflictUtility: renderMergeConflictUtility != null,
		hasGutterRenderUtility: renderGutterUtility != null,
		hasCustomHeader: renderCustomHeader != null,
		disableWorkerPool,
	});
	const children = renderDiffChildren({
		fileDiff,
		renderCustomHeader,
		renderHeaderPrefix,
		renderHeaderFilenameSuffix,
		renderHeaderMetadata,
		renderAnnotation,
		renderGutterUtility,
		lineAnnotations: renderedAnnotations,
		getHoveredLine,
		actions,
		renderMergeConflictUtility,
		getInstance,
	});
	return (
		<diffs-container ref={ref} className={className} style={style}>
			{templateRender(children, prerenderedHTML)}
		</diffs-container>
	);
}
