import type { OctaneNode } from 'octane';

import type {
	FileDiffEditChangeHandler,
	FileDiffEditCompleteEvent,
	FileDiffEditCompleteHandler,
	FileDiffMetadata,
} from '@pierre/diffs';
import type { DiffBasePropsReact } from './types';
import { renderDiffChildren } from './utils/renderDiffChildren.tsrx';
import { templateRender } from './utils/templateRender.tsrx';
import { useFileDiffInstance } from './utils/useFileDiffInstance';

export type {
	FileDiffEditChangeHandler,
	FileDiffEditCompleteEvent,
	FileDiffEditCompleteHandler,
	FileDiffMetadata,
};

export interface FileDiffProps<LAnnotation, Caret> extends DiffBasePropsReact<LAnnotation, Caret> {
	fileDiff: FileDiffMetadata;
	disableWorkerPool?: boolean;
}

export function FileDiff<LAnnotation = undefined, Caret = undefined>({
	fileDiff,
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
}: FileDiffProps<LAnnotation, Caret>): OctaneNode {
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
		renderGutterUtility,
		lineAnnotations: renderedAnnotations,
		getHoveredLine,
		getAnnotationSlotName,
	});
	return (
		<diffs-container ref={ref} className={className} style={style}>
			{templateRender(children, prerenderedHTML)}
		</diffs-container>
	);
}
