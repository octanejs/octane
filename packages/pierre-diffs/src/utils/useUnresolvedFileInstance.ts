import { useCallback, useContext, useLayoutEffect, useRef, useState } from 'octane';

import {
	areOptionsEqual,
	type DiffLineAnnotation,
	EMPTY_LINE_ANNOTATIONS,
	type FileContents,
	type FileDiffMetadata,
	type GetHoveredLineResult,
	type MergeConflictActionPayload,
	type MergeConflictMarkerRow,
	type SelectedLineRange,
	UnresolvedFile,
	UnresolvedFile as UnresolvedFileClass,
	type UnresolvedFileOptions,
} from '@pierre/diffs';
import {
	type MergeConflictDiffAction,
	parseMergeConflictDiffFromFile,
} from '../core/parseMergeConflictDiffFromFile';
import { noopRender } from '../constants';
import type { UnresolvedFileReactOptions } from '../UnresolvedFile.tsrx';
import { WorkerPoolContext } from '../WorkerPoolContext.tsrx';
import { useForceUpdate } from './useForceUpdate';
import { useNextRenderData } from './useNextRenderData';
import { useStableCallback } from './useStableCallback';

interface UseUnresolvedFileInstanceProps<LAnnotation> {
	file: FileContents;
	options?: UnresolvedFileReactOptions<LAnnotation>;
	lineAnnotations: DiffLineAnnotation<LAnnotation>[] | undefined;
	selectedLines: SelectedLineRange | null | undefined;
	prerenderedHTML: string | undefined;
	hasConflictUtility: boolean;
	hasGutterRenderUtility: boolean;
	hasCustomHeader: boolean;
	disableWorkerPool: boolean;
}

interface UseUnresolvedFileInstanceReturn<LAnnotation> {
	lineAnnotations: DiffLineAnnotation<LAnnotation>[];
	fileDiff: FileDiffMetadata;
	actions: (MergeConflictDiffAction | undefined)[];
	markerRows: MergeConflictMarkerRow[];
	ref(node: HTMLElement | null): void;
	getHoveredLine(): GetHoveredLineResult<'diff'> | undefined;
	getInstance(): UnresolvedFile<LAnnotation> | undefined;
}

export function useUnresolvedFileInstance<LAnnotation>({
	file,
	options,
	lineAnnotations,
	selectedLines,
	prerenderedHTML,
	hasConflictUtility,
	hasGutterRenderUtility,
	hasCustomHeader,
	disableWorkerPool,
}: UseUnresolvedFileInstanceProps<LAnnotation>): UseUnresolvedFileInstanceReturn<LAnnotation> {
	const [{ fileDiff, actions, markerRows }, setState] = useState(() => {
		const { fileDiff, actions, markerRows } = parseMergeConflictDiffFromFile(
			file,
			options?.maxContextLines,
		);
		return { fileDiff, actions, markerRows };
	});
	// UnresolvedFile is intentionally uncontrolled in React. Keep an internal
	// source-of-truth file so sequential conflict actions apply to the latest
	// resolved contents rather than the initial prop value.
	const onMergeConflictAction = useStableCallback(
		(payload: MergeConflictActionPayload, instance: UnresolvedFile<LAnnotation>) => {
			setState((prevState) => {
				const { fileDiff, actions, markerRows } =
					instance.resolveConflict(
						payload.conflict.conflictIndex,
						payload.resolution,
						prevState.fileDiff,
					) ?? {};
				if (fileDiff == null || actions == null || markerRows == null) {
					return prevState;
				} else {
					return { fileDiff, actions, markerRows };
				}
			});
		},
	);
	const controlledSelection = selectedLines !== undefined;
	const poolManager = useContext(WorkerPoolContext);
	const instanceRef = useRef<UnresolvedFileClass<LAnnotation> | null>(null);
	const forceUpdate = useForceUpdate();
	const renderData = useNextRenderData(instanceRef, {
		fileDiff,
		actions,
		markerRows,
		lineAnnotations,
	}) ?? {
		fileDiff,
		actions,
		markerRows,
		lineAnnotations: lineAnnotations ?? EMPTY_LINE_ANNOTATIONS,
	};
	const ref = useStableCallback((fileContainer: HTMLElement | null) => {
		if (fileContainer != null) {
			if (instanceRef.current != null) {
				throw new Error(
					'useUnresolvedFileInstance: An instance should not already exist when a node is created',
				);
			}
			instanceRef.current = new UnresolvedFileClass(
				mergeUnresolvedOptions({
					controlledSelection,
					hasConflictUtility,
					hasCustomHeader,
					hasGutterRenderUtility,
					onMergeConflictAction,
					options,
				}),
				!disableWorkerPool ? poolManager : undefined,
				forceUpdate,
			);
			void instanceRef.current.hydrate({
				fileDiff,
				actions,
				markerRows,
				fileContainer,
				lineAnnotations,
				prerenderedHTML,
			});
		} else {
			if (instanceRef.current == null) {
				throw new Error(
					'useUnresolvedFileInstance: A UnresolvedFile instance should exist when unmounting',
				);
			}
			instanceRef.current.cleanUp();
			instanceRef.current = null;
		}
	});

	useLayoutEffect(() => {
		if (instanceRef.current == null) return;
		const instance = instanceRef.current;
		const newOptions = mergeUnresolvedOptions({
			controlledSelection,
			hasConflictUtility,
			hasCustomHeader,
			hasGutterRenderUtility,
			onMergeConflictAction,
			options,
		});
		const forceRender = !areOptionsEqual(instance.options, newOptions);
		instance.setOptions(newOptions);
		void instance.render({
			fileDiff,
			actions,
			markerRows,
			lineAnnotations,
			forceRender,
		});
		if (selectedLines !== undefined) {
			instance.setSelectedLines(selectedLines);
		}
	}, null);

	const getHoveredLine = useCallback((): GetHoveredLineResult<'diff'> | undefined => {
		return instanceRef.current?.getHoveredLine();
	}, []);

	const getInstance = useCallback(() => {
		return instanceRef.current ?? undefined;
	}, []);

	return { ...renderData, ref, getHoveredLine, getInstance };
}

interface MergeUnresolvedOptionsProps<LAnnotation> {
	options: UnresolvedFileReactOptions<LAnnotation> | undefined;
	controlledSelection: boolean;
	onMergeConflictAction: UnresolvedFileOptions<LAnnotation>['onMergeConflictAction'];
	hasConflictUtility: boolean;
	hasGutterRenderUtility: boolean;
	hasCustomHeader: boolean;
}

function mergeUnresolvedOptions<LAnnotation>({
	options,
	controlledSelection,
	onMergeConflictAction,
	hasConflictUtility,
	hasCustomHeader,
	hasGutterRenderUtility,
}: MergeUnresolvedOptionsProps<LAnnotation>): UnresolvedFileOptions<LAnnotation> {
	return {
		...options,
		controlledSelection,
		onMergeConflictAction,
		hunkSeparators: options?.hunkSeparators === 'custom' ? noopRender : options?.hunkSeparators,
		// Add a placeholder type for the custom render
		mergeConflictActionsType:
			hasConflictUtility || options?.mergeConflictActionsType === 'custom'
				? noopRender
				: options?.mergeConflictActionsType,
		renderCustomHeader: hasCustomHeader ? noopRender : undefined,
		renderGutterUtility: hasGutterRenderUtility ? noopRender : undefined,
	};
}
