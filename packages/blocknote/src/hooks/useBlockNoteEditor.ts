import type {
	BlockNoteEditor,
	BlockNoteSchema,
	BlockSchema,
	DefaultBlockSchema,
	DefaultInlineContentSchema,
	DefaultStyleSchema,
	InlineContentSchema,
	StyleSchema,
} from '@blocknote/core';
import { useContext } from 'octane';

import { BlockNoteContext, type BlockNoteContextValue } from '../editor/BlockNoteContext';

/** Read the editor supplied by the nearest BlockNoteView or BlockNoteContext. */
export function useBlockNoteEditor<
	BSchema extends BlockSchema = DefaultBlockSchema,
	ISchema extends InlineContentSchema = DefaultInlineContentSchema,
	SSchema extends StyleSchema = DefaultStyleSchema,
>(schema?: BlockNoteSchema<BSchema, ISchema, SSchema>): BlockNoteEditor<BSchema, ISchema, SSchema> {
	void schema;
	const context = useContext(BlockNoteContext) as unknown as
		BlockNoteContextValue<BSchema, ISchema, SSchema> | undefined;

	if (!context?.editor) {
		throw new Error('useBlockNoteEditor must be used inside BlockNoteView or BlockNoteContext');
	}

	return context.editor;
}
