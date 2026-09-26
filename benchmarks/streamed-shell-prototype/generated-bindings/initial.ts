// This is the exact server snapshot; the renderer adopts it before refreshing
// from the live source, including when streaming completed during lazy loading.
export const initial = {
	title: 'Conversation status',
	response: 'Waiting for response',
	history: 'Waiting for history',
	interactions: 'Interactions: 0',
};
