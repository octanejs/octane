import type * as Core from '@pierre/diffs';
import type {
	CodeView as CodeViewClass,
	CodeViewItem,
	CodeViewItemEditCompleteHandler as CoreCodeViewItemEditCompleteHandler,
	FileContents,
	FileDiff as FileDiffClass,
	FileDiffEditChangeHandler as CoreFileDiffEditChangeHandler,
	FileDiffMetadata,
	FileEditCompleteEvent as CoreFileEditCompleteEvent,
	UnresolvedFile as UnresolvedFileClass,
	Virtualizer as VirtualizerClass,
} from '@pierre/diffs';
import type { EditorFactory as CoreEditorFactory } from '@pierre/diffs/edit';
import type {
	WorkerInitializationRenderOptions as CoreWorkerInitializationRenderOptions,
	WorkerPoolManager,
	WorkerPoolOptions as CoreWorkerPoolOptions,
} from '@pierre/diffs/worker';
import type { Context, CSSProperties, OctaneNode, Ref } from 'octane';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import * as Port from '@octanejs/pierre-diffs';
import {
	CodeView,
	EditContext,
	EditProvider,
	File,
	FileDiff,
	GutterUtilitySlotStyles,
	MergeConflictSlotStyles,
	MultiFileDiff,
	noopRender,
	PatchDiff,
	renderDiffChildren,
	renderFileChildren,
	templateRender,
	UnresolvedFile,
	useCreateEditor,
	useFileDiffInstance,
	useFileInstance,
	useStableCallback,
	useVirtualizer,
	useWorkerPool,
	Virtualizer,
	VirtualizerContext,
	WorkerPoolContext,
	WorkerPoolContextProvider,
	type CodeViewAnnotationArgs,
	type CodeViewHandle,
	type CodeViewItemEditCompleteHandler,
	type CodeViewProps,
	type CodeViewReactOptions,
	type ControlledCodeViewProps,
	type DiffBasePropsReact,
	type EditorFactory,
	type EditProviderProps,
	type FileDiffEditChangeHandler,
	type FileDiffOptions,
	type FileDiffProps,
	type FileEditCompleteEvent,
	type FileOptions,
	type FileProps,
	type MergeConflictActionsTypeOption,
	type MultiFileDiffProps,
	type PatchDiffProps,
	type RenderMergeConflictActionContext,
	type RenderMergeConflictActions,
	type UncontrolledCodeViewProps,
	type UnresolvedFileProps,
	type UnresolvedFileReactOptions,
	type WorkerInitializationRenderOptions,
	type WorkerPoolOptions,
} from '@octanejs/pierre-diffs';

declare const fileDiff: FileDiffMetadata;
declare const file: FileContents;
declare const items: readonly CodeViewItem<string>[];

const handle: { current: CodeViewHandle<string, undefined> | null } = { current: null };
const codeView = <CodeView<string> ref={handle} items={items} renderAnnotation={() => 'note'} />;
const diff = <FileDiff<string> fileDiff={fileDiff} renderHeaderMetadata={() => <span />} />;
const single = <File file={file} disableWorkerPool />;
const multi = <MultiFileDiff oldFile={file} newFile={file} />;
const patch = <PatchDiff patch="diff --git a/x b/x" />;
const unresolved = <UnresolvedFile file={file} />;
const virtualized = (
	<Virtualizer config={{}}>
		<FileDiff fileDiff={fileDiff} />
	</Virtualizer>
);
const pool = (
	<WorkerPoolContextProvider
		poolOptions={{ workerFactory: () => new Worker('worker.js') }}
		highlighterOptions={{}}
	>
		{diff}
	</WorkerPoolContextProvider>
);
const editing = (
	<EditProvider<string>
		createEditor={(() => undefined) as unknown as EditorFactory<string, undefined>}
	>
		{codeView}
	</EditProvider>
);
const stable = useStableCallback((value: number) => value + 1);

export type Checks = [
	Assert<Equal<typeof codeView, typeof diff>>,
	Assert<
		Equal<
			Parameters<typeof CodeView<string, undefined>>[0],
			CodeViewProps<string, undefined> & { ref?: Ref<CodeViewHandle<string, undefined>> }
		>
	>,
	Assert<
		Equal<
			ReturnType<CodeViewHandle<string, undefined>['getInstance']>,
			CodeViewClass<string, undefined> | undefined
		>
	>,
	Assert<
		Equal<ControlledCodeViewProps<string, undefined>['items'], readonly CodeViewItem<string>[]>
	>,
	Assert<
		Equal<
			UncontrolledCodeViewProps<string, undefined>['initialItems'],
			readonly CodeViewItem<string>[] | undefined
		>
	>,
	Assert<
		Equal<
			CodeViewReactOptions<string, undefined>,
			Omit<
				Core.CodeViewOptions<string, undefined>,
				'controlledSelection' | 'createEditor' | 'onSelectedLinesChange'
			>
		>
	>,
	Assert<
		Equal<
			CodeViewAnnotationArgs<string>[2],
			Core.CodeViewFileItem<string> | Core.CodeViewDiffItem<string>
		>
	>,
	Assert<
		Equal<
			CodeViewItemEditCompleteHandler<string, undefined>,
			CoreCodeViewItemEditCompleteHandler<string, undefined>
		>
	>,
	Assert<Equal<Parameters<typeof File<string, undefined>>[0], FileProps<string, undefined>>>,
	Assert<Equal<ReturnType<typeof File>, OctaneNode>>,
	Assert<
		Equal<
			FileOptions<string, undefined>,
			Omit<Core.FileOptions<string, undefined>, 'onEditChange' | 'onEditComplete'>
		>
	>,
	Assert<
		Equal<FileEditCompleteEvent<string, undefined>, CoreFileEditCompleteEvent<string, undefined>>
	>,
	Assert<
		Equal<Parameters<typeof FileDiff<string, undefined>>[0], FileDiffProps<string, undefined>>
	>,
	Assert<Equal<FileDiffProps<string, undefined>['fileDiff'], FileDiffMetadata>>,
	Assert<
		Equal<
			FileDiffOptions<string, undefined>,
			Omit<Core.FileDiffOptions<string, undefined>, 'onEditChange' | 'onEditComplete'>
		>
	>,
	Assert<
		Equal<
			FileDiffEditChangeHandler<string, undefined>,
			CoreFileDiffEditChangeHandler<string, undefined>
		>
	>,
	Assert<
		Equal<
			DiffBasePropsReact<string, undefined>['renderAnnotation'],
			| ((annotation: Core.DiffLineAnnotation<string>, fileDiff: FileDiffMetadata) => OctaneNode)
			| undefined
		>
	>,
	Assert<
		Equal<
			Parameters<typeof MultiFileDiff<string, undefined>>[0],
			MultiFileDiffProps<string, undefined>
		>
	>,
	Assert<
		Equal<Parameters<typeof PatchDiff<string, undefined>>[0], PatchDiffProps<string, undefined>>
	>,
	Assert<Equal<PatchDiffProps<string, undefined>['patch'], string>>,
	Assert<Equal<Parameters<typeof UnresolvedFile<string>>[0], UnresolvedFileProps<string>>>,
	Assert<Equal<UnresolvedFileReactOptions<string>['maxContextLines'], number | undefined>>,
	Assert<Equal<ReturnType<RenderMergeConflictActions>, OctaneNode>>,
	Assert<
		Equal<
			RenderMergeConflictActionContext['resolveConflict'],
			(resolution: Core.MergeConflictResolution) => void
		>
	>,
	Assert<Equal<MergeConflictActionsTypeOption, 'none' | 'default' | RenderMergeConflictActions>>,
	Assert<Equal<typeof VirtualizerContext, Context<VirtualizerClass | undefined>>>,
	Assert<Equal<ReturnType<typeof useVirtualizer>, VirtualizerClass | undefined>>,
	Assert<Equal<ReturnType<typeof Virtualizer>, OctaneNode>>,
	Assert<Equal<typeof WorkerPoolContext, Context<WorkerPoolManager | undefined>>>,
	Assert<Equal<ReturnType<typeof useWorkerPool>, WorkerPoolManager | undefined>>,
	Assert<Equal<ReturnType<typeof WorkerPoolContextProvider>, OctaneNode>>,
	Assert<Equal<WorkerPoolOptions, CoreWorkerPoolOptions>>,
	Assert<Equal<WorkerInitializationRenderOptions, CoreWorkerInitializationRenderOptions>>,
	// oxlint-disable-next-line typescript/no-explicit-any
	Assert<Equal<typeof EditContext, Context<CoreEditorFactory<any, any> | undefined>>>,
	Assert<
		Equal<
			EditProviderProps<string, undefined>['createEditor'],
			CoreEditorFactory<string, undefined>
		>
	>,
	Assert<
		Equal<
			ReturnType<typeof useCreateEditor<string, undefined>>,
			CoreEditorFactory<string, undefined> | undefined
		>
	>,
	Assert<Equal<ReturnType<typeof EditProvider>, OctaneNode>>,
	Assert<Equal<EditorFactory<string, undefined>, CoreEditorFactory<string, undefined>>>,
	Assert<Equal<typeof GutterUtilitySlotStyles, CSSProperties>>,
	Assert<Equal<typeof MergeConflictSlotStyles, CSSProperties>>,
	Assert<Equal<typeof noopRender, () => null>>,
	Assert<Equal<ReturnType<typeof renderDiffChildren>, OctaneNode>>,
	Assert<Equal<ReturnType<typeof renderFileChildren>, OctaneNode>>,
	Assert<
		Equal<typeof templateRender, (children: OctaneNode, __html: string | undefined) => OctaneNode>
	>,
	Assert<
		Equal<ReturnType<typeof useFileDiffInstance<string, undefined>>['fileDiff'], FileDiffMetadata>
	>,
	Assert<Equal<ReturnType<typeof useFileInstance<string, undefined>>['file'], FileContents>>,
	Assert<Equal<typeof stable, (value: number) => number>>,
	Assert<Equal<typeof single | typeof multi | typeof patch | typeof unresolved, typeof diff>>,
	Assert<Equal<typeof virtualized | typeof pool | typeof editing, typeof diff>>,
	Assert<Equal<FileDiffClass<string, undefined>, Core.FileDiff<string, undefined>>>,
	Assert<Equal<UnresolvedFileClass<string>, Core.UnresolvedFile<string>>>,
	// The core types module, re-exported as upstream's `export * from '../types'`.
	Assert<Equal<Port.CodeViewScrollBehavior, Core.CodeViewScrollBehavior>>,
	Assert<Equal<Port.FileContents, Core.FileContents>>,
	Assert<Equal<Port.FileDiffLoadedChangedFiles, Core.FileDiffLoadedChangedFiles>>,
	Assert<Equal<Port.FileDiffLoadedPureRenamedFile, Core.FileDiffLoadedPureRenamedFile>>,
	Assert<Equal<Port.FileDiffLoadedFiles, Core.FileDiffLoadedFiles>>,
	Assert<Equal<Port.DiffFileInput, Core.DiffFileInput>>,
	Assert<Equal<Port.MaybeDiffFileInput, Core.MaybeDiffFileInput>>,
	Assert<Equal<Port.FileDiffContentsLoader, Core.FileDiffContentsLoader>>,
	Assert<Equal<Port.HighlighterTypes, Core.HighlighterTypes>>,
	Assert<Equal<Port.HighlightedToken, Core.HighlightedToken>>,
	Assert<Equal<Port.DiffsThemeNames, Core.DiffsThemeNames>>,
	Assert<Equal<Port.ThemesType, Core.ThemesType>>,
	Assert<Equal<Port.ChangeTypes, Core.ChangeTypes>>,
	Assert<Equal<Port.ParsedPatch, Core.ParsedPatch>>,
	Assert<Equal<Port.ContextContent, Core.ContextContent>>,
	Assert<Equal<Port.ChangeContent, Core.ChangeContent>>,
	Assert<Equal<Port.Hunk, Core.Hunk>>,
	Assert<Equal<Port.FileDiffMetadata, Core.FileDiffMetadata>>,
	Assert<Equal<Port.MergeConflictMarkerRowType, Core.MergeConflictMarkerRowType>>,
	Assert<Equal<Port.MergeConflictMarkerRow, Core.MergeConflictMarkerRow>>,
	Assert<Equal<Port.SupportedLanguages, Core.SupportedLanguages>>,
	Assert<Equal<Port.HunkLineType, Core.HunkLineType>>,
	Assert<Equal<Port.ThemeTypes, Core.ThemeTypes>>,
	Assert<Equal<Port.PostRenderPhase, Core.PostRenderPhase>>,
	Assert<Equal<Port.HunkSeparators, Core.HunkSeparators>>,
	Assert<Equal<Port.LineDiffTypes, Core.LineDiffTypes>>,
	Assert<Equal<Port.DiffIndicators, Core.DiffIndicators>>,
	Assert<Equal<Port.BaseCodeOptions, Core.BaseCodeOptions>>,
	Assert<Equal<Port.BaseDiffOptions, Core.BaseDiffOptions>>,
	Assert<Equal<Port.BaseDiffOptionsWithDefaults, Core.BaseDiffOptionsWithDefaults>>,
	Assert<Equal<Port.CustomPreProperties, Core.CustomPreProperties>>,
	Assert<Equal<Port.PrePropertiesConfig, Core.PrePropertiesConfig>>,
	Assert<Equal<Port.FileHeaderRenderMode, Core.FileHeaderRenderMode>>,
	Assert<Equal<Port.RenderHeaderMetadataCallback, Core.RenderHeaderMetadataCallback>>,
	Assert<Equal<Port.RenderHeaderPrefixCallback, Core.RenderHeaderPrefixCallback>>,
	Assert<Equal<Port.RenderHeaderFilenameSuffixCallback, Core.RenderHeaderFilenameSuffixCallback>>,
	Assert<Equal<Port.RenderFileMetadata, Core.RenderFileMetadata>>,
	Assert<Equal<Port.ExtensionFormatMap, Core.ExtensionFormatMap>>,
	Assert<Equal<Port.AnnotationSide, Core.AnnotationSide>>,
	Assert<Equal<Port.SelectionSide, Core.SelectionSide>>,
	Assert<Equal<Port.SelectedLineRange, Core.SelectedLineRange>>,
	Assert<Equal<Port.LineAnnotation, Core.LineAnnotation>>,
	Assert<Equal<Port.DiffLineAnnotation, Core.DiffLineAnnotation>>,
	Assert<Equal<Port.CodeViewFileItem, Core.CodeViewFileItem>>,
	Assert<Equal<Port.CodeViewDiffItem, Core.CodeViewDiffItem>>,
	Assert<Equal<Port.CodeViewItem<never>, Core.CodeViewItem<never>>>,
	Assert<Equal<Port.CodeViewPositionScrollTarget, Core.CodeViewPositionScrollTarget>>,
	Assert<Equal<Port.CodeViewLineScrollTarget, Core.CodeViewLineScrollTarget>>,
	Assert<Equal<Port.CodeViewRangeScrollTarget, Core.CodeViewRangeScrollTarget>>,
	Assert<Equal<Port.NumericScrollLineAnchor, Core.NumericScrollLineAnchor>>,
	Assert<Equal<Port.CodeViewItemScrollTarget, Core.CodeViewItemScrollTarget>>,
	Assert<Equal<Port.CodeViewScrollTarget, Core.CodeViewScrollTarget>>,
	Assert<Equal<Port.MergeConflictResolution, Core.MergeConflictResolution>>,
	Assert<Equal<Port.MergeConflictRegion, Core.MergeConflictRegion>>,
	Assert<Equal<Port.MergeConflictActionPayload, Core.MergeConflictActionPayload>>,
	Assert<Equal<Port.GapSpan, Core.GapSpan>>,
	Assert<Equal<Port.LineSpans, Core.LineSpans>>,
	Assert<Equal<Port.LineTypes, Core.LineTypes>>,
	Assert<Equal<Port.LineInfo, Core.LineInfo>>,
	Assert<Equal<Port.SharedRenderState, Core.SharedRenderState>>,
	Assert<Equal<Port.AnnotationSpan, Core.AnnotationSpan>>,
	Assert<Equal<Port.LineEventBaseProps, Core.LineEventBaseProps>>,
	Assert<Equal<Port.DiffLineEventBaseProps, Core.DiffLineEventBaseProps>>,
	Assert<Equal<Port.TokenEventBase, Core.TokenEventBase>>,
	Assert<Equal<Port.DiffTokenEventBaseProps, Core.DiffTokenEventBaseProps>>,
	Assert<Equal<Port.ObservedAnnotationNodes, Core.ObservedAnnotationNodes>>,
	Assert<Equal<Port.ObservedGridNodes, Core.ObservedGridNodes>>,
	Assert<Equal<Port.CodeColumnType, Core.CodeColumnType>>,
	Assert<Equal<Port.HunkData, Core.HunkData>>,
	Assert<Equal<Port.AnnotationLineMap<never>, Core.AnnotationLineMap<never>>>,
	Assert<Equal<Port.ExpansionDirections, Core.ExpansionDirections>>,
	Assert<Equal<Port.ThemedFileResult, Core.ThemedFileResult>>,
	Assert<Equal<Port.RenderDiffFilesResult, Core.RenderDiffFilesResult>>,
	Assert<Equal<Port.ThemedDiffResult, Core.ThemedDiffResult>>,
	Assert<Equal<Port.HunkExpansionRegion, Core.HunkExpansionRegion>>,
	Assert<Equal<Port.ForceDiffPlainTextOptions, Core.ForceDiffPlainTextOptions>>,
	Assert<Equal<Port.ForceFilePlainTextOptions, Core.ForceFilePlainTextOptions>>,
	Assert<Equal<Port.RenderFileOptions, Core.RenderFileOptions>>,
	Assert<Equal<Port.RenderDiffOptions, Core.RenderDiffOptions>>,
	Assert<Equal<Port.RenderFileResult, Core.RenderFileResult>>,
	Assert<Equal<Port.RenderDiffResult, Core.RenderDiffResult>>,
	Assert<Equal<Port.RenderedFileASTCache, Core.RenderedFileASTCache>>,
	Assert<Equal<Port.RenderedDiffASTCache, Core.RenderedDiffASTCache>>,
	Assert<Equal<Port.RenderRange, Core.RenderRange>>,
	Assert<Equal<Port.RenderWindow, Core.RenderWindow>>,
	Assert<Equal<Port.VirtualWindowSpecs, Core.VirtualWindowSpecs>>,
	Assert<Equal<Port.VirtualFileMetrics, Core.VirtualFileMetrics>>,
	Assert<Equal<Port.PendingCodeViewLayoutReset, Core.PendingCodeViewLayoutReset>>,
	Assert<Equal<Port.CodeViewLayout, Core.CodeViewLayout>>,
	Assert<Equal<Port.SmoothScrollSettings, Core.SmoothScrollSettings>>,
	Assert<Equal<Port.SelectionPoint, Core.SelectionPoint>>,
	Assert<Equal<Port.DiffAcceptRejectHunkType, Core.DiffAcceptRejectHunkType>>,
	Assert<Equal<Port.ConflictResolverTypes, Core.ConflictResolverTypes>>,
	Assert<Equal<Port.DiffAcceptRejectHunkConfig, Core.DiffAcceptRejectHunkConfig>>,
	Assert<Equal<Port.ProcessFileConflictData, Core.ProcessFileConflictData>>,
	Assert<Equal<Port.AppliedThemeStyleCache, Core.AppliedThemeStyleCache>>,
	Assert<Equal<Port.StickySpecs, Core.StickySpecs>>,
];

// @ts-expect-error a FileDiff needs its fileDiff
export const missingDiff = <FileDiff />;

// @ts-expect-error a PatchDiff patch is a string
export const numericPatch = <PatchDiff patch={1} />;

// @ts-expect-error controlled and uncontrolled CodeView items are exclusive
export const bothItems = <CodeView items={items} initialItems={items} />;

// @ts-expect-error the React-owned edit callbacks are props, not options
export const optionCallback: FileOptions<string, undefined> = { onEditChange() {} };

// @ts-expect-error React's Provider form does not exist in Octane
export const provider = WorkerPoolContext.Provider;
