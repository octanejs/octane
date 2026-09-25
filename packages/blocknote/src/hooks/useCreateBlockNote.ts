// Independently authored Octane adapter for the public @blocknote/react 0.53.0 API.
import {
	BlockNoteEditor,
	type BlockNoteEditorOptions,
	type CustomBlockNoteSchema,
	type DefaultBlockSchema,
	type DefaultInlineContentSchema,
	type DefaultStyleSchema,
} from '@blocknote/core';
import { useMemo } from 'octane';

import { splitSlot, subSlot } from '../internal';

type DependencyList = readonly unknown[];

const noDeps: DependencyList = [];

/** Create a BlockNote editor once, or again whenever `deps` change. */
export function useCreateBlockNote<
	Options extends Partial<BlockNoteEditorOptions<any, any, any>> | undefined,
>(
	options?: Options,
	deps?: DependencyList,
): Options extends { schema: CustomBlockNoteSchema<infer B, infer I, infer S> }
	? BlockNoteEditor<B, I, S>
	: BlockNoteEditor<DefaultBlockSchema, DefaultInlineContentSchema, DefaultStyleSchema>;
export function useCreateBlockNote(...args: unknown[]): BlockNoteEditor<any, any, any> {
	const [userArgs, slot] = splitSlot(args);
	const options = userArgs[0] as Partial<BlockNoteEditorOptions<any, any, any>> | undefined;
	const deps = (userArgs[1] as DependencyList | undefined) ?? noDeps;

	return useMemo(
		() => BlockNoteEditor.create(options ?? {}),
		deps as unknown[],
		subSlot(slot, 'create'),
	);
}
