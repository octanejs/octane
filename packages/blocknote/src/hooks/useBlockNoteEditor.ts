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

import { useBlockNoteContext } from '../BlockNoteContext';
import { splitSlot } from '../internal';

/** Read the editor from the nearest `BlockNoteViewRaw` or `BlockNoteContext`. */
export function useBlockNoteEditor<
	B extends BlockSchema = DefaultBlockSchema,
	I extends InlineContentSchema = DefaultInlineContentSchema,
	S extends StyleSchema = DefaultStyleSchema,
>(schema?: BlockNoteSchema<B, I, S>): BlockNoteEditor<B, I, S>;
export function useBlockNoteEditor(...args: unknown[]): BlockNoteEditor<any, any, any> {
	const [userArgs] = splitSlot(args);
	const context = useBlockNoteContext(userArgs[0] as BlockNoteSchema<any, any, any> | undefined);

	if (!context?.editor) {
		throw new Error(
			'useBlockNoteEditor was called outside of a BlockNoteContext provider or BlockNoteViewRaw component',
		);
	}

	return context.editor;
}
