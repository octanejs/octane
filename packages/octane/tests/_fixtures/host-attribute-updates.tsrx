export function Values(props) @{
	<section>
		<a
			id="anchor"
			title={props.value}
			href={props.url}
			data-n={props.value}
			download={props.value}
		/>
		<img id="image" src={props.url} />
		<svg id="svg" viewBox={props.value} xmlns={props.value}>
			<circle id="circle" cx={props.value} strokeWidth={props.value} />
			<use id="use" xlinkHref={props.url} />
		</svg>
		<input id="control" value={props.value} size={props.value} readOnly />
		<div id="enumerated" spellCheck={props.value} />
		<custom-values id="custom" title={props.value} href={props.url} />
	</section>
}

export function Metadata(props) @{
	<>
		<title lang={props.lang}>{props.text as string}</title>
		<meta name="description" {...props.attrs} content={props.content} />
		<div>page</div>
	</>
}

export function ScalarValue(props) @{
	<a id="scalar" title={props.title} href={props.url} />
}

function Reader(props) @{
	<p>{props.read() as string}</p>
}

function PendingMetadata(props) @{
	<>
		<title>{props.label as string}</title>
		<meta name="pending-description" content={props.label} />
	</>
}

export function PendingValues(props) @{
	<>
		<a id="pending-link" title={props.label} href={props.url} />
		<PendingMetadata label={props.label} />
		<Reader read={props.read} />
	</>
}
