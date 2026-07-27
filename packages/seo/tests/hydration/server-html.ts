/**
 * The exact server output for `_fixtures/hydrate-page.tsrx`.
 *
 * Hydration must run against CLIENT-compiled sources while this markup comes
 * from a SERVER-compiled graph, and one vitest project cannot hold both. The
 * bytes are therefore materialized here, and `tests/ssr/server-html.test.ts`
 * re-renders the same fixture and asserts it still produces exactly these
 * strings, so this file cannot drift out of sync silently. When that test
 * fails, copy the values it reports back into this file.
 */
export const SERVER_HEAD =
	'<!--rnh-700b6de4--><title>Count 0</title><!--/rnh-700b6de4--><!--rnh-7877c718--><meta name' +
	'="theme-color" content="#000000"><!--/rnh-7877c718--><!--rnh-7877c718--><meta name="descri' +
	'ption" content="page description"><!--/rnh-7877c718--><!--rnh-82c0a63a--><link rel="canoni' +
	'cal" href="https://example.com/counter"><!--/rnh-82c0a63a-->';

export const SERVER_BODY =
	'<!--[--><!--[--><!--[--><!--[--><!--[--><!--[--><!--[--><!--[--><!--[--><!--]--><!--[--><!' +
	'--]--><!--]--><!--]--><!--]--><!--]--><!--[--><!--[--><!--]--><main><button id="bump">bump' +
	' 0</button></main><!--]--><!--]--><!--[--><!--[f1--><!--[--><!--[--><!--[--><!--[--><!--]-' +
	'-><!--]--><!--]--><!--]--><!--[--><!--[--><!--[--><!--[--><!--]--><!--]--><!--]--><!--]-->' +
	'<!--[--><!--[--><!--[--><!--[--><!--]--><!--]--><!--]--><!--]--><!--[--><!--[--><!--[--><!' +
	'--[--><!--]--><!--]--><!--]--><!--]--><!--]--><!--]--><!--]--><!--]--><!--]-->';
