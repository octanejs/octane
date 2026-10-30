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

// Under Bun the core's lazily imported highlighter backends load within the
// suite's 10 ms render waits. Vitest transforms each module on first import,
// so load that module graph once before the suite instead.
await Promise.all([
	import(/* @vite-ignore */ `${pinnedRoot}/src/highlighter/backends/shiki.ts`),
	import(/* @vite-ignore */ `${pinnedRoot}/src/highlighter/backends/highlights.ts`),
	import(/* @vite-ignore */ `${pinnedRoot}/src/highlighter/languages/resolveLanguage.ts`),
	import(/* @vite-ignore */ `${pinnedRoot}/src/highlighter/themes/themeResolver.ts`),
	import('shiki/core'),
	import('shiki/engine/javascript'),
	import('shiki/langs'),
	import('@pierre/highlights/themes/loader'),
	import('@pierre/theming/themes'),
]);
