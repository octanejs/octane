import { $getRoot, createEditor } from 'lexical';
import { PAGECRAFT_NODES } from './nodes';

const validationEditor = createEditor({
	namespace: 'PagecraftDocumentValidation',
	nodes: PAGECRAFT_NODES,
	onError: (error) => {
		throw error;
	},
});

export interface ValidatedEditorState {
	plainText: string;
}

/** Validate serialized content through Lexical itself instead of trusting JSON shape alone. */
export function validateEditorState(value: unknown): ValidatedEditorState | null {
	if (typeof value !== 'string' || value.length === 0 || value.length > 800_000) return null;
	try {
		const editorState = validationEditor.parseEditorState(value);
		let plainText = '';
		editorState.read(() => {
			plainText = $getRoot().getTextContent();
		});
		if (plainText.length > 100_000) return null;
		return { plainText };
	} catch {
		return null;
	}
}
