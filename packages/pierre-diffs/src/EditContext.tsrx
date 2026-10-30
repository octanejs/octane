// oxlint-disable typescript/no-explicit-any
import {
	type Context,
	createContext,
	type OctaneNode,
	type PropsWithChildren,
	useContext,
} from 'octane';

import type { Editor, EditorFactory, EditorOptions, EditorType } from '@pierre/diffs/edit';
import { useStableCallback } from './utils/useStableCallback';

export type { EditorFactory } from '@pierre/diffs/edit';

export interface EditProviderProps<LAnnotation, Caret> {
	/** Combines shared defaults with the supplied per-surface options. */
	createEditor: EditorFactory<LAnnotation, Caret>;
}

export const EditContext: Context<EditorFactory<any, any> | undefined> = createContext<
	EditorFactory<any, any> | undefined
>(undefined);

export function EditProvider<LAnnotation = undefined, Caret = undefined>({
	children,
	createEditor,
}: PropsWithChildren<EditProviderProps<LAnnotation, Caret>>): OctaneNode {
	const stableCreateEditor = useStableCallback(
		<EType extends EditorType>(
			editorType: EType,
			options: EditorOptions<EType, LAnnotation, Caret>,
			editStateKey?: string,
		): Editor<EType, LAnnotation, Caret> => createEditor(editorType, options, editStateKey),
	);
	return <EditContext value={stableCreateEditor}>{children}</EditContext>;
}

export function useCreateEditor<LAnnotation, Caret>():
	EditorFactory<LAnnotation, Caret> | undefined {
	return useContext(EditContext);
}
