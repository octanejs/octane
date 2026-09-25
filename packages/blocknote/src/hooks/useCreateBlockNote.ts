import {
	BlockNoteEditor,
	type BlockNoteEditorOptions,
	type CustomBlockNoteSchema,
	type DefaultBlockSchema,
	type DefaultInlineContentSchema,
	type DefaultStyleSchema,
} from '@blocknote/core';
import { useMemo } from 'octane';

export type BlockNoteDependencyList = readonly unknown[];

type CreatedBlockNoteEditor<
	Options extends Partial<BlockNoteEditorOptions<any, any, any>> | undefined,
> = Options extends {
	schema: CustomBlockNoteSchema<infer BSchema, infer ISchema, infer SSchema>;
}
	? BlockNoteEditor<BSchema, ISchema, SSchema>
	: BlockNoteEditor<DefaultBlockSchema, DefaultInlineContentSchema, DefaultStyleSchema>;

/** Create one BlockNote editor for the lifetime of the supplied dependency list. */
export function useCreateBlockNote<
	Options extends Partial<BlockNoteEditorOptions<any, any, any>> | undefined,
>(
	options: Options = {} as Options,
	dependencies: BlockNoteDependencyList = [],
): CreatedBlockNoteEditor<Options> {
	// Compiled calls to custom hooks carry their slot as a trailing symbol. When an
	// optional argument is omitted that symbol can occupy its position.
	const normalizedOptions = typeof options === 'symbol' ? ({} as Options) : options;
	const normalizedDependencies = typeof dependencies === 'symbol' ? [] : dependencies;

	return useMemo(
		() => BlockNoteEditor.create(normalizedOptions),
		normalizedDependencies as unknown[],
	) as CreatedBlockNoteEditor<Options>;
}
