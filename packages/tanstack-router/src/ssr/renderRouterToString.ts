import { renderToString as octaneRenderToString } from 'octane/server';
import { renderSsrHtmlResponse } from '@tanstack/router-core/ssr/server';
import type { ComponentBody } from 'octane';
import type { AnyRouter } from '@tanstack/router-core';

type RouterApp = ComponentBody<{ router: AnyRouter }>;
type ServerComponent = Parameters<typeof octaneRenderToString>[0];

// router-core 1.171.34 owns HTML serialization: `renderSsrHtmlResponse` runs the
// framework render, pipes the result through `transformHtmlStringWithRouter`
// (which prepends `<!DOCTYPE html>` and injects the dehydrated router scripts at
// the `<Scripts>` boundary), derives the HTTP status, and cleans up `serverSsr`.
// Dehydration already ran in start-server-core's request handler. Octane only
// supplies the rendered document HTML with its scoped CSS folded into `<head>`.
export async function renderRouterToString({
	router,
	responseHeaders,
	App,
}: {
	router: AnyRouter;
	responseHeaders: Headers;
	App: RouterApp;
}) {
	return renderSsrHtmlResponse({
		router,
		responseHeaders,
		render: () => {
			const result = octaneRenderToString(
				App as unknown as ServerComponent,
				{ router },
				{ nonce: router.options.ssr?.nonce },
			);
			return foldCssIntoHead(result.html, result.css);
		},
	});
}

// Fold octane's scoped-style output into the document head. Unlike the previous
// implementation this adds no `<!DOCTYPE html>` and no router-script injection —
// `transformHtmlStringWithRouter` now owns both.
export function foldCssIntoHead(renderedHtml: string, css: string) {
	if (!css) return renderedHtml;
	return renderedHtml.includes('</head>')
		? renderedHtml.replace('</head>', `${css}</head>`)
		: `${css}${renderedHtml}`;
}
