// The pinned suite runs under Bun; this file gives both Vitest lanes the two
// Bun runtime behaviors it relies on. The pristine lane points
// PIERRE_DIFFS_PRISTINE_ROOT at its scratch copy of the pinned tree.
const pinnedRoot = process.env.PIERRE_DIFFS_PRISTINE_ROOT ?? `${import.meta.dirname}/../upstream`;

// Bun's global `postMessage(message)` posts to the global scope, as a browser
// window's does with its default target origin. jsdom requires the target
// origin, so supply the browser default.
const postMessage = window.postMessage.bind(window);
window.postMessage = ((message: unknown, targetOrigin?: string | WindowPostMessageOptions) =>
	postMessage(message, targetOrigin ?? '*')) as typeof window.postMessage;

// Under Bun the core's shared highlighter, which a CodeView's first render
// preloads for its theme, is ready within the suite's 10 ms render waits.
// Vitest transforms each module on first import and can miss them, so preload
// it for the default theme before the suite, as that first render would.
const [{ preloadHighlighter }, { DEFAULT_THEMES }, { getThemes }] = await Promise.all([
	import(/* @vite-ignore */ `${pinnedRoot}/src/highlighter/shared_highlighter.ts`),
	import(/* @vite-ignore */ `${pinnedRoot}/src/constants.ts`),
	import(/* @vite-ignore */ `${pinnedRoot}/src/utils/getThemes.ts`),
]);
await preloadHighlighter({ themes: getThemes(DEFAULT_THEMES), langs: [] });
