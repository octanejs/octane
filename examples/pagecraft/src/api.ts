import type {
	DocumentResult,
	DocumentSummary,
	SaveDocumentInput,
	SaveDocumentResult,
} from './types';
import { validateEditorState } from './editor-state';

function requestParameters(): URLSearchParams {
	const source = new URLSearchParams(window.location.search);
	const parameters = new URLSearchParams();
	parameters.set('session', source.get('session')?.trim() || 'pagecraft-demo');
	const fault = source.get('fault');
	if (fault) parameters.set('fault', fault);
	return parameters;
}

async function readJson<Result>(response: Response): Promise<Result> {
	if (!response.ok) throw new Error(`Pagecraft request failed with ${response.status}`);
	return (await response.json()) as Result;
}

export function loadDocuments(): Promise<{ ok: true; documents: DocumentSummary[] }> {
	return fetch(`/api/documents?${requestParameters()}`).then((response) => readJson(response));
}

export function loadDocument(documentId: string): Promise<DocumentResult> {
	return fetch(`/api/documents/${encodeURIComponent(documentId)}?${requestParameters()}`)
		.then((response) => readJson<DocumentResult>(response))
		.then((result): DocumentResult => {
			if (!result.ok) return result;
			const document = result.document;
			if (
				document.id !== documentId ||
				typeof document.title !== 'string' ||
				document.title.trim().length === 0 ||
				document.title.length > 120 ||
				typeof document.eyebrow !== 'string' ||
				typeof document.updatedAt !== 'string' ||
				!Number.isSafeInteger(document.version) ||
				document.version < 0 ||
				validateEditorState(document.editorState) === null
			) {
				return {
					ok: false,
					kind: 'temporary',
					message: 'This document contains invalid editor data. Nothing was opened or replaced.',
				};
			}
			return result;
		});
}

export function saveDocument(
	documentId: string,
	input: SaveDocumentInput,
): Promise<SaveDocumentResult> {
	return fetch(`/api/documents/${encodeURIComponent(documentId)}?${requestParameters()}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
	})
		.then((response) => readJson<SaveDocumentResult & { ok: boolean; message?: string }>(response))
		.then((result) => {
			if (!result.ok) throw new Error(result.message || 'Pagecraft could not save this document');
			return result;
		});
}
