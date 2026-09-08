// Milestone 1 bootstrap — BlockNoteViewRaw deferred until .js import paths are normalized.
export {
	BlockNoteContext,
	useBlockNoteContext,
	type BlockNoteContextValue,
} from './editor/BlockNoteContext.js';

export { useBlockNoteEditor } from './hooks/useBlockNoteEditor.js';
export { useCreateBlockNote } from './hooks/useCreateBlockNote.tsrx';

// Re-export when editor shell imports resolve:
// export { BlockNoteViewRaw, BlockNoteViewEditor, type BlockNoteViewProps } from './editor/BlockNoteView.tsrx';
