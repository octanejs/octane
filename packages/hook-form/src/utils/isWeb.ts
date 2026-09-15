// Adapted from react-hook-form@7.88.0 src/utils/isWeb.ts for Octane.
export default typeof window !== 'undefined' &&
	typeof window.HTMLElement !== 'undefined' &&
	typeof document !== 'undefined';
