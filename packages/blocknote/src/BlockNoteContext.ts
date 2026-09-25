// Independently authored Octane adapter for the public @blocknote/react 0.53.0 API.
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

/** The value a `BlockNoteViewRaw` shares with its descendants. */
export type BlockNoteContextValue<
	B extends BlockSchema = DefaultBlockSchema,
	I extends InlineContentSchema = DefaultInlineContentSchema,
	S extends StyleSchema = DefaultStyleSchema,
> = {
	editor?: BlockNoteEditor<B, I, S>;
	colorSchemePreference?: 'light' | 'dark';
	setContentEditableProps?: (props: Record<string, any> | undefined) => void;
};

export const BlockNoteContext = createContext<BlockNoteContextValue<any, any, any> | undefined>(
	undefined,
);

/**
 * Read the nearest BlockNote context. The optional schema only narrows the
 * returned editor type; it is not checked at runtime.
 */
export function useBlockNoteContext<
	B extends BlockSchema = DefaultBlockSchema,
	I extends InlineContentSchema = DefaultInlineContentSchema,
	S extends StyleSchema = DefaultStyleSchema,
>(_schema?: BlockNoteSchema<B, I, S>): BlockNoteContextValue<B, I, S> | undefined {
	return useContext(BlockNoteContext) as BlockNoteContextValue<B, I, S> | undefined;
}
