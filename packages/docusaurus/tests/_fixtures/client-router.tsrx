import type { OctaneNode } from 'octane';
import type { DataRouter } from '@octanejs/remix-router';
import { DocusaurusRouterProvider, useDocusaurusRouteContext } from '../../src/client.js';
import type { DocusaurusManifest } from '../../types/index.js';

export function ClientRouterApp(props: { manifest: DocusaurusManifest; router: DataRouter }) @{
	<DocusaurusRouterProvider manifest={props.manifest} router={props.router} />
}

export function DocsLayout(props: { children?: OctaneNode }) @{
	const context = useDocusaurusRouteContext();
	<section data-plugin={context.plugin.name}>
		<header>Documentation</header>
		<div class="docs-outlet">{props.children}</div>
	</section>
}

export function DocItem(props: {
	children?: OctaneNode;
	content: (() => OctaneNode) & { title: string };
	related: { label: string };
	version: string;
}) @{
	const context = useDocusaurusRouteContext();
	const Content = props.content;
	<article
		data-context={`${context.data.section as string}:${context.data.kind as string}`}
		data-related={props.related.label}
		data-version={props.version}
	>
		<h1>{Content.title}</h1>
		<Content />
	</article>
}

export function IntroContent() @{
	<p>Introduction body</p>
}

export function AdvancedContent() @{
	<p>Advanced body</p>
}
