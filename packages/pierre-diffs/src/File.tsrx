import type { OctaneNode } from 'octane';

import {
	type FileEditChangeHandler,
	type FileEditCompleteEvent,
	type FileEditCompleteHandler,
} from '@pierre/diffs';
import type { FileProps } from './types';
import { renderFileChildren } from './utils/renderFileChildren.tsrx';
import { templateRender } from './utils/templateRender.tsrx';
import { useFileInstance } from './utils/useFileInstance';

export type { FileEditChangeHandler, FileEditCompleteEvent, FileEditCompleteHandler };
export type { FileOptions } from './types';

export function File<LAnnotation = undefined, Caret = undefined>({
	file,
	lineAnnotations,
	selectedLines,
	options,
	editorOptions,
	editStateKey,
	metrics,
	className,
	style,
	renderAnnotation,
	renderCustomHeader,
	renderHeaderPrefix,
	renderHeaderFilenameSuffix,
	renderHeaderMetadata,
	prerenderedHTML,
	renderGutterUtility,
	disableWorkerPool = false,
	edit = false,
	onEditChange,
	onEditComplete,
}: FileProps<LAnnotation, Caret>): OctaneNode {
	const {
		ref,
		getHoveredLine,
		getAnnotationSlotName,
		file: renderedFile,
		lineAnnotations: renderedAnnotations,
	} = useFileInstance({
		file,
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
	const children = renderFileChildren({
		file: renderedFile,
		renderAnnotation,
		renderCustomHeader,
		renderHeaderPrefix,
		renderHeaderFilenameSuffix,
		renderHeaderMetadata,
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
