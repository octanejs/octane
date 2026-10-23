import { Hydrate, use, useEffect, useState } from 'octane';
import { interaction } from 'octane/hydration';

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

// The server renders `html` from the plain string; the client hydrates with the
// same markup as a TrustedHTML from the `app` policy.
export const PAGE_HTML = '<i>trusted</i>';

type Ready = ((name: string) => void) | undefined;

interface PageProps {
	html: TrustedHTML;
	ready?: Ready;
}

// `on` mounts a fresh row and shape after hydration, so their templates parse
// in table and SVG context.
function Rows(props: { label: string; html: TrustedHTML; on: boolean }) @{
	<>
		<tr id="row">
			<td>{props.label as string}</td>
			<td id="row-html" dangerouslySetInnerHTML={{ __html: props.html }} />
		</tr>
		@if (props.on) {
			<tr id="row-added">
				<td>{'added'}</td>
			</tr>
		}
	</>
}

function Shapes(props: { label: string; on: boolean }) @{
	<g id="shapes">
		<text id="shape">{props.label as string}</text>
		@if (props.on) {
			<rect id="rect" width="1" height="1" />
		}
	</g>
}

export function HydratedPage(props: PageProps) @{
	const [on, setOn] = useState(false);
	useEffect(() => {
		props.ready?.('page');
	}, []);
	<main id="page">
		<button id="toggle" onClick={() => setOn(true)}>
			{'Toggle'}
		</button>
		<div id="page-html" dangerouslySetInnerHTML={{ __html: props.html }} />
		<table>
			<tbody>
				<Rows label="row" html={props.html} on={on} />
			</tbody>
		</table>
		<svg viewBox="0 0 10 10">
			<Shapes label="shape" on={on} />
		</svg>
	</main>
}

interface StreamedPageProps extends PageProps {
	rows: Promise<string>;
	shapes: Promise<string>;
}

function AsyncRows(props: {
	promise: Promise<string>;
	html: TrustedHTML;
	on: boolean;
	ready: Ready;
}) @{
	const label = use(props.promise);
	useEffect(() => {
		props.ready?.('rows');
	}, []);
	<Rows label={label} html={props.html} on={props.on} />
}

function AsyncShapes(props: { promise: Promise<string>; on: boolean; ready: Ready }) @{
	const label = use(props.promise);
	useEffect(() => {
		props.ready?.('shapes');
	}, []);
	<Shapes label={label} on={props.on} />
}

// Each boundary resolves after the shell, so its segment reveals inside table
// content and inside SVG.
export function StreamedPage(props: StreamedPageProps) @{
	const [on, setOn] = useState(false);
	<main id="page">
		<button id="toggle" onClick={() => setOn(true)}>
			{'Toggle'}
		</button>
		<div id="page-html" dangerouslySetInnerHTML={{ __html: props.html }} />
		<table>
			<tbody>
				@try {
					<AsyncRows promise={props.rows} html={props.html} on={on} ready={props.ready} />
				} @pending {
					<tr id="rows-fallback">
						<td>{'Loading'}</td>
					</tr>
				}
			</tbody>
		</table>
		<svg viewBox="0 0 10 10">
			@try {
				<AsyncShapes promise={props.shapes} on={on} ready={props.ready} />
			} @pending {
				<text id="shapes-fallback">{'Loading'}</text>
			}
		</svg>
	</main>
}

// The first click activates the boundary and is replayed on the toggle.
export function DeferredPage(props: PageProps) @{
	<Hydrate when={interaction({ events: 'click' })} onHydrated={() => props.ready?.('deferred')}>
		<HydratedPage html={props.html} ready={props.ready} />
	</Hydrate>
}
