'use strong';

// The document elements only the server renders. The compiler builds <html>,
// <head>, and <body> imperatively, through element descriptors, so client
// builds resolve `#server-document` to serverDocument.client.ts instead and never
// import those factories.
import type { HtmlProps } from '../Html';
import type { HeadProps } from '../Head';
import type { BodyProps } from '../Body';
import { HydrationRangeOwner } from './HydrationRangeOwner.tsrx';

export function ServerHtml(props: HtmlProps) @{
	const { children, ...attrs } = props;
	<html {...attrs}>{children}</html>
}

export function ServerHead(props: HeadProps) @{
	const { children, ...attrs } = props;
	<head {...attrs}>{children}</head>
}

export function ServerBody(props: BodyProps) @{
	const { children, ...attrs } = props;
	<body {...attrs}>
		<div id="__app">
			<HydrationRangeOwner children={children} />
		</div>
	</body>
}
