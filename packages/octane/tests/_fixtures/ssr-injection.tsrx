import { createElement, use } from 'octane';

// Streaming SSR external-injection fixtures: a fragment root and a
// full-document root, each with one @try boundary suspending on a promise
// prop. The document shell (html/head/body) is built with createElement — the
// same shape framework document components use (authored `<head>` is not
// supported in .tsrx; head elements hoist) — which is exactly the surface
// external `<script>` injection merges into.

function Inner(props) @{
	const value = use(props.promise);
	<p id="inner">
		{value as string}
	</p>
}

export function FragmentApp(props) @{
	<div id="app">
		<p>shell</p>
		@try {
			<Inner promise={props.promise} />
		} @pending {
			<p id="pending">loading</p>
		}
	</div>
}

export function DocumentApp(props) {
	return createElement(
		'html',
		{ lang: 'en' },
		createElement('head', null, createElement('title', null, 'injection')),
		createElement('body', null, createElement(FragmentApp, { promise: props.promise })),
	);
}
