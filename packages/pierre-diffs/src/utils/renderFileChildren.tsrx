import type { OctaneNode } from 'octane';

import {
	CUSTOM_HEADER_SLOT_ID,
	type FileContents,
	type GetHoveredLineResult,
	getLineAnnotationName,
	HEADER_FILENAME_SUFFIX_SLOT_ID,
	HEADER_METADATA_SLOT_ID,
	HEADER_PREFIX_SLOT_ID,
	type LineAnnotation,
} from '@pierre/diffs';
import { GutterUtilitySlotStyles } from '../constants';
import type { FileProps } from '../types';

interface RenderFileChildrenProps<LAnnotation, Caret> {
	file: FileContents;
	renderCustomHeader: FileProps<LAnnotation, Caret>['renderCustomHeader'];
	renderHeaderPrefix: FileProps<LAnnotation, Caret>['renderHeaderPrefix'];
	renderHeaderFilenameSuffix?: FileProps<LAnnotation, Caret>['renderHeaderFilenameSuffix'];
	renderHeaderMetadata: FileProps<LAnnotation, Caret>['renderHeaderMetadata'];
	renderAnnotation: FileProps<LAnnotation, Caret>['renderAnnotation'];
	lineAnnotations: FileProps<LAnnotation, Caret>['lineAnnotations'];
	renderGutterUtility: FileProps<LAnnotation, Caret>['renderGutterUtility'];
	getHoveredLine(): GetHoveredLineResult<'file'> | undefined;
	getAnnotationSlotName?(annotation: LineAnnotation<LAnnotation>): string;
}

export function renderFileChildren<LAnnotation, Caret>({
	file,
	renderCustomHeader,
	renderHeaderPrefix,
	renderHeaderFilenameSuffix,
	renderHeaderMetadata,
	renderAnnotation,
	lineAnnotations,
	renderGutterUtility,
	getHoveredLine,
	getAnnotationSlotName = getLineAnnotationName,
}: RenderFileChildrenProps<LAnnotation, Caret>): OctaneNode {
	const customHeader = renderCustomHeader?.(file);
	const prefix = renderHeaderPrefix?.(file);
	const suffix = renderHeaderFilenameSuffix?.(file);
	const metadata = renderHeaderMetadata?.(file);
	return (
		<>
			{customHeader != null ? (
				<div slot={CUSTOM_HEADER_SLOT_ID}>{customHeader}</div>
			) : (
				<>
					{prefix != null && <div slot={HEADER_PREFIX_SLOT_ID}>{prefix}</div>}
					{suffix != null && <div slot={HEADER_FILENAME_SUFFIX_SLOT_ID}>{suffix}</div>}
					{metadata != null && <div slot={HEADER_METADATA_SLOT_ID}>{metadata}</div>}
				</>
			)}
			{renderAnnotation != null &&
				lineAnnotations?.map((annotation, index) => (
					<div key={index} slot={getAnnotationSlotName(annotation)}>
						{renderAnnotation(annotation, file)}
					</div>
				))}
			{renderGutterUtility != null && (
				<div slot="gutter-utility-slot" style={GutterUtilitySlotStyles}>
					{renderGutterUtility(getHoveredLine)}
				</div>
			)}
		</>
	);
}
