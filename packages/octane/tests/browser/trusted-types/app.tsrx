import { use } from 'octane';

interface StreamedProps {
	promise: Promise<string>;
}

// The resolved arm carries raw HTML with a literal `</template>`, so the server
// sends it in the JSON script carrier that $OCTRC parses with innerHTML.
export function Streamed(props: StreamedProps) @{
	<main id="streamed">
		@try {
			<Late promise={props.promise} />
		} @pending {
			<p id="fallback">{'Loading'}</p>
		}
	</main>
}

function Late(props: StreamedProps) @{
	const html = use(props.promise);
	<div id="late" dangerouslySetInnerHTML={{ __html: html }} />
}

interface ClientProps {
	html: TrustedHTML;
	doc: TrustedHTML;
	src: unknown;
}

export function ClientApp(props: ClientProps) @{
	<section id="client">
		<b id="static">{'static'}</b>
		<div id="html" dangerouslySetInnerHTML={{ __html: props.html }} />
		<iframe id="frame" srcdoc={props.doc as unknown as string} />
		<script id="src" type="text/plain" src={props.src as unknown as string} />
	</section>
}

export function RawHtml(props: { html: string }) @{
	<div id="raw" dangerouslySetInnerHTML={{ __html: props.html }} />
}
