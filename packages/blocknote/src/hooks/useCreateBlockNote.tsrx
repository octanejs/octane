import {
	BlockNoteEditor,
	BlockNoteEditorOptions,
	CustomBlockNoteSchema,
	DefaultBlockSchema,
	DefaultInlineContentSchema,
	DefaultStyleSchema,
} from '@blocknote/core';
import { useMemo } from 'octane';

type DependencyList = readonly unknown[];

/**
 * Hook to instantiate a BlockNote Editor instance in React
 */
export const useCreateBlockNote = <Options extends | Partial<BlockNoteEditorOptions<any, any, any>>
| undefined,>(
	options: Options = {} as Options,
	deps: DependencyList = [],
): Options extends {
	schema: CustomBlockNoteSchema<infer BSchema, infer ISchema, infer SSchema>;
}
	? BlockNoteEditor<BSchema, ISchema, SSchema>
	: BlockNoteEditor<DefaultBlockSchema, DefaultInlineContentSchema, DefaultStyleSchema> => {
	const normalizedOptions =
		typeof (options as unknown) === 'symbol' ? {} as Options : options;
	const normalizedDeps =
		typeof (deps as unknown) === 'symbol' ? [] : deps;

	return useMemo(() => {
		const editor = BlockNoteEditor.create(normalizedOptions) as any;
		if (window) {
			// for testing / dev purposes
			(window as any).ProseMirror = editor._tiptapEditor;
		}
		return editor;
	}, normalizedDeps as unknown[]); //eslint-disable-line react-hooks/exhaustive-deps
};
