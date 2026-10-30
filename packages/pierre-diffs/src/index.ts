// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="./jsx.d.ts" />
// oxlint-disable-next-line typescript/triple-slash-reference
/// <reference path="./node-timeout.d.ts" />

// Upstream's `export * from '../types'`: the core's types module, which
// @pierre/diffs publishes only through its root entry.
export type {
	AnnotationLineMap,
	AnnotationSide,
	AnnotationSpan,
	AppliedThemeStyleCache,
	BaseCodeOptions,
	BaseDiffOptions,
	BaseDiffOptionsWithDefaults,
	ChangeContent,
	ChangeTypes,
	CodeColumnType,
	CodeViewDiffItem,
	CodeViewFileItem,
	CodeViewItem,
	CodeViewItemScrollTarget,
	CodeViewLayout,
	CodeViewLineScrollTarget,
	CodeViewPositionScrollTarget,
	CodeViewRangeScrollTarget,
	CodeViewScrollBehavior,
	CodeViewScrollTarget,
	ConflictResolverTypes,
	ContextContent,
	CustomPreProperties,
	DiffAcceptRejectHunkConfig,
	DiffAcceptRejectHunkType,
	DiffFileInput,
	DiffIndicators,
	DiffLineAnnotation,
	DiffLineEventBaseProps,
	DiffTokenEventBaseProps,
	DiffsThemeNames,
	ExpansionDirections,
	ExtensionFormatMap,
	FileContents,
	FileDiffContentsLoader,
	FileDiffLoadedChangedFiles,
	FileDiffLoadedFiles,
	FileDiffLoadedPureRenamedFile,
	FileDiffMetadata,
	FileHeaderRenderMode,
	ForceDiffPlainTextOptions,
	ForceFilePlainTextOptions,
	GapSpan,
	HighlightedToken,
	HighlighterTypes,
	Hunk,
	HunkData,
	HunkExpansionRegion,
	HunkLineType,
	HunkSeparators,
	LineAnnotation,
	LineDiffTypes,
	LineEventBaseProps,
	LineInfo,
	LineSpans,
	LineTypes,
	MaybeDiffFileInput,
	MergeConflictActionPayload,
	MergeConflictMarkerRow,
	MergeConflictMarkerRowType,
	MergeConflictRegion,
	MergeConflictResolution,
	NumericScrollLineAnchor,
	ObservedAnnotationNodes,
	ObservedGridNodes,
	ParsedPatch,
	PendingCodeViewLayoutReset,
	PostRenderPhase,
	PrePropertiesConfig,
	ProcessFileConflictData,
	RenderDiffFilesResult,
	RenderDiffOptions,
	RenderDiffResult,
	RenderFileMetadata,
	RenderFileOptions,
	RenderFileResult,
	RenderHeaderFilenameSuffixCallback,
	RenderHeaderMetadataCallback,
	RenderHeaderPrefixCallback,
	RenderRange,
	RenderWindow,
	RenderedDiffASTCache,
	RenderedFileASTCache,
	SelectedLineRange,
	SelectionPoint,
	SelectionSide,
	SharedRenderState,
	SmoothScrollSettings,
	StickySpecs,
	SupportedLanguages,
	ThemeTypes,
	ThemedDiffResult,
	ThemedFileResult,
	ThemesType,
	TokenEventBase,
	VirtualFileMetrics,
	VirtualWindowSpecs,
} from '@pierre/diffs';
export * from './CodeView.tsrx';
export * from './File.tsrx';
export * from './FileDiff.tsrx';
export * from './UnresolvedFile.tsrx';
export * from './MultiFileDiff.tsrx';
export * from './PatchDiff.tsrx';
export * from './Virtualizer.tsrx';
export * from './WorkerPoolContext.tsrx';
export * from './EditContext.tsrx';
export * from './constants';
export * from './types';
export * from './utils/renderDiffChildren.tsrx';
export * from './utils/renderFileChildren.tsrx';
export * from './utils/templateRender.tsrx';
export * from './utils/useFileDiffInstance';
export * from './utils/useFileInstance';
export * from './utils/useStableCallback';
