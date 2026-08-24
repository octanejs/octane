// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
const parseIsSsrByDefault = (): boolean =>
	!(
		typeof window !== 'undefined' &&
		window.document &&
		Boolean(window.document.createElement) &&
		window.setTimeout
	);

export const Global = {
	devToolsEnabled: true,
	isSsr: parseIsSsrByDefault(),
};
