// React 19 hoists document metadata from ANYWHERE in the tree. Octane's client
// compiler already partitions nested <title>/<meta>/<link> (and Float
// resources) out of host elements; the server must serialize the same
// partition instead of rejecting the nesting.
export function NestedHead(props: { title: string }) @{
	<section id="nested-host">
		<title>{props.title as string}</title>
		<meta name="desc" content="nested" />
		<link rel="stylesheet" href="/nested.css" precedence="default" />
		<div class="inner">{'body' as string}</div>
	</section>
}

// Deeper nesting: metadata two hosts down, beside dynamic content.
export function DeepNestedHead() @{
	<main id="deep-host">
		<article>
			<meta name="deep" content="two-levels" />
			<p class="deep-p">{'deep' as string}</p>
		</article>
	</main>
}
