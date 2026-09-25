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
import { createContext, useContext } from 'octane';

export type BlockNoteContextValue<
	BSchema extends BlockSchema = DefaultBlockSchema,
	ISchema extends InlineContentSchema = DefaultInlineContentSchema,
	SSchema extends StyleSchema = DefaultStyleSchema,
> = {
	editor?: BlockNoteEditor<BSchema, ISchema, SSchema>;
	colorSchemePreference?: 'light' | 'dark';
};

export const BlockNoteContext = createContext<BlockNoteContextValue | undefined>(undefined);

/** Read the nearest BlockNote editor context, optionally narrowed by a custom schema. */
export function useBlockNoteContext<
	BSchema extends BlockSchema = DefaultBlockSchema,
	ISchema extends InlineContentSchema = DefaultInlineContentSchema,
	SSchema extends StyleSchema = DefaultStyleSchema,
>(
	_schema?: BlockNoteSchema<BSchema, ISchema, SSchema>,
): BlockNoteContextValue<BSchema, ISchema, SSchema> | undefined {
	return useContext(BlockNoteContext) as
		BlockNoteContextValue<BSchema, ISchema, SSchema> | undefined;
}
