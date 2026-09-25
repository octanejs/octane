import { BlockNoteSchema, defaultBlockSpecs, type BlockNoteEditor } from '@blocknote/core';
import * as BlockNote from '@octanejs/blocknote';
import type { JSX } from 'octane';

type Editor = BlockNoteEditor;
declare const editor: Editor;

const contextValue: BlockNote.BlockNoteContextValue = { editor, colorSchemePreference: 'dark' };
const dependencies: BlockNote.BlockNoteDependencyList = [editor];
const viewEditorResult: JSX.Element = BlockNote.BlockNoteViewEditor({});
const editorHookResult: Editor = BlockNote.useBlockNoteEditor();
const createHookResult: Editor = BlockNote.useCreateBlockNote();
const props = {
	editor,
	editable: false,
	renderEditor: true,
	theme: 'dark',
	onChange(currentEditor) {
		currentEditor.document;
	},
} satisfies BlockNote.BlockNoteViewProps;

BlockNote.BlockNoteView(props);
BlockNote.BlockNoteViewEditor({});
BlockNote.useBlockNoteContext();
BlockNote.useBlockNoteEditor();
BlockNote.useCreateBlockNote({}, dependencies);
void BlockNote.BlockNoteContext;
void contextValue;
void viewEditorResult;
void editorHookResult;
void createHookResult;

// @ts-expect-error BlockNoteView always requires an editor instance.
const missingEditor: BlockNote.BlockNoteViewProps = {};
// @ts-expect-error Only light and dark color schemes are supported.
const invalidTheme: BlockNote.BlockNoteViewProps = { editor, theme: 'blue' };
// @ts-expect-error Editor options must match BlockNoteEditorOptions.
BlockNote.useCreateBlockNote(42);
void missingEditor;
void invalidTheme;

const schema = BlockNoteSchema.create({ blockSpecs: { paragraph: defaultBlockSpecs.paragraph } });
type CustomEditor = BlockNoteEditor<
	typeof schema.blockSchema,
	typeof schema.inlineContentSchema,
	typeof schema.styleSchema
>;
const customEditor: CustomEditor = BlockNote.useCreateBlockNote({ schema });
const customContextEditor: CustomEditor | undefined = BlockNote.useBlockNoteContext(schema)?.editor;
const customHookEditor: CustomEditor = BlockNote.useBlockNoteEditor(schema);
BlockNote.BlockNoteView({
	editor: customEditor,
	onChange(currentEditor) {
		const blockType: 'paragraph' = currentEditor.document[0]!.type;
		void blockType;
	},
});
// @ts-expect-error The custom schema does not contain heading blocks.
customEditor.insertBlocks([{ type: 'heading' }], customEditor.document[0]!);
void customContextEditor;
void customHookEditor;
