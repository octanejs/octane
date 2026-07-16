export interface DocumentSummary {
	id: string;
	title: string;
	eyebrow: string;
	updatedAt: string;
}

export interface PageDocument extends DocumentSummary {
	editorState: string;
	version: number;
}

export interface SaveDocumentInput {
	title: string;
	editorState: string;
	plainText: string;
	version: number;
}

export interface SaveDocumentResult {
	applied: boolean;
	savedAt: string;
	version: number;
}

export type DocumentResult =
	| { ok: true; document: PageDocument }
	| { ok: false; kind: 'not-found' | 'temporary'; message: string };
