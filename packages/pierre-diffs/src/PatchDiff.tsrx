import { type OctaneNode, useMemo } from 'octane';

import { type FileDiffMetadata, getSingularPatch } from '@pierre/diffs';
import type { DiffBasePropsReact } from './types';
import { renderDiffChildren } from './utils/renderDiffChildren.tsrx';
import { templateRender } from './utils/templateRender.tsrx';
import { useFileDiffInstance } from './utils/useFileDiffInstance';

export interface PatchDiffProps<LAnnotation, Caret> extends DiffBasePropsReact<LAnnotation, Caret> {
	patch: string;
	disableWorkerPool?: boolean;
}

export function PatchDiff<LAnnotation = undefined, Caret = undefined>({
	patch,
	options,
	editorOptions,
	editStateKey,
	metrics,
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
	disableWorkerPool = false,
	edit = false,
	onEditChange,
	onEditComplete,
}: PatchDiffProps<LAnnotation, Caret>): OctaneNode {
	const fileDiff = usePatch(patch);
	const {
		ref,
		getHoveredLine,
		getAnnotationSlotName,
		fileDiff: renderedDiff,
		lineAnnotations: renderedAnnotations,
	} = useFileDiffInstance({
		fileDiff,
		options,
		editorOptions,
		editStateKey,
		metrics,
		lineAnnotations,
		selectedLines,
		prerenderedHTML,
		hasGutterRenderUtility: renderGutterUtility != null,
		hasCustomHeader: renderCustomHeader != null,
		disableWorkerPool,
		edit,
		onEditChange,
		onEditComplete,
	});
	const children = renderDiffChildren({
		fileDiff: renderedDiff,
		renderCustomHeader,
		renderHeaderPrefix,
		renderHeaderFilenameSuffix,
		renderHeaderMetadata,
		renderAnnotation,
		lineAnnotations: renderedAnnotations,
		renderGutterUtility,
		getHoveredLine,
		getAnnotationSlotName,
	});
	return (
		<diffs-container ref={ref} className={className} style={style}>
			{templateRender(children, prerenderedHTML)}
		</diffs-container>
	);
}

function usePatch(patch: string): FileDiffMetadata {
	return useMemo<FileDiffMetadata>(() => getSingularPatch(patch), [patch]);
}
