import * as React from 'react';
import type { DocFeedback } from '~/db/types';

interface DocFeedbackContextValue {
	// User feedback for the current page
	userNotes: DocFeedback[];

	// Collapsed state
	collapsedNotes: Set<string>;
	toggleNote: (noteId: string) => void;

	// Actions
	onAddFeedback: (
		blockSelector: string,
		blockContentHash: string | undefined,
		type: 'note' | 'improvement',
	) => void;
	onEditNote: (note: DocFeedback) => void;
	onShowNote: (noteId: string) => void;

	// Page info
	pagePath: string;
	libraryId: string;
	libraryVersion: string;
}

const DocFeedbackContext = React.createContext<DocFeedbackContextValue | null>(null);

export function useDocFeedback() {
	const context = React.useContext(DocFeedbackContext);
	return context;
}

export function useDocFeedbackRequired() {
	const context = useDocFeedback();
	if (!context) {
		throw new Error('useDocFeedback must be used within DocFeedbackProvider');
	}
	return context;
}

export const DocFeedbackContextProvider = DocFeedbackContext.Provider;
