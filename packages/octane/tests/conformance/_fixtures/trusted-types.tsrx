export function Html(props: any) @{
	<div id="html" dangerouslySetInnerHTML={{ __html: props.html }} />
}

export function ScriptText(props: any) @{
	<script id="script" type="text/plain" dangerouslySetInnerHTML={{ __html: props.code }} />
}

export function Frame(props: any) @{
	<iframe id="frame" srcdoc={props.doc} />
}

export function ScriptSrc(props: any) @{
	<script id="script-src" src={props.src} />
}

export function Link(props: any) @{
	<a id="link" href={props.href}>
		{'link'}
	</a>
}

export function SvgScript(props: any) @{
	<svg>
		<script id="svg-script" {...{ xlinkHref: props.href }} />
	</svg>
}

export function Spread(props: any) @{
	<iframe id="spread" {...props.attrs} />
}

export function Static() @{
	<section id="static">
		<b>{'static'}</b>
	</section>
}
