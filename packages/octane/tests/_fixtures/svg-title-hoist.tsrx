function SvgTitleBoundary(props) @{
	<svg id={props.id} viewBox="0 0 10 10" role="img">{props.children}</svg>
}

function HtmlTitleBoundary(props) @{
	<section id={props.id}>{props.children}</section>
}

function Outer(props) @{
	<div id="directive-title-outer">{props.children}</div>
}

export function LexicalSvgTitles(props) @{
	<>
		<title data-lexical-document-title="true">
			{props.documentTitle as string}
		</title>
		<svg id="lexical-svg-title-boundary" viewBox="0 0 10 10">
			<path d="M0,0 h10">
				<title data-lexical-svg-title="true">
					{props.svgTitle as string}
				</title>
			</path>
		</svg>
	</>
}

// The document title makes the returned fragment take the template-normalized
// path. The title passed through SvgTitleBoundary still has an unknown namespace
// until that component chooses to place its children inside an SVG.
export function ReturnedMixedTitles(props) {
	return <>
		<title data-opaque-boundary-document-title="true">
			{props.documentTitle as string}
		</title>
		<section id="mixed-title-boundaries">
			<SvgTitleBoundary id="nested-svg-title-boundary">
				<title data-opaque-boundary-svg-title="nested">
					{props.svgTitle as string}
				</title>
			</SvgTitleBoundary>
		</section>
	</>;
}

// A directly returned component root uses a separate value-lowering decision
// from a component nested beneath a returned host tree.
export function DirectReturnedSvgTitle(props) {
	return <SvgTitleBoundary id="direct-svg-title-boundary">
		<title data-opaque-boundary-svg-title="direct">
			{props.svgTitle as string}
		</title>
	</SvgTitleBoundary>;
}

// Template-form component children use a marked render function rather than
// returned-JSX descriptors. The title still resolves against SvgTitleBoundary's
// actual host, and the evaluated spread is shared by either destination.
export function TemplateSvgTitle(props) @{
	<SvgTitleBoundary id="template-svg-title-boundary">
		<title key={props.titleKey} ref={props.titleRef} class={props.titleClass} {...props.titleProps}>
			{props.svgTitle as string}
		</title>
	</SvgTitleBoundary>
}

// An opaque boundary can also choose HTML. Destination-aware deferral must keep
// React-style document-head hoisting for that case instead of making every
// component child title inline.
export function TemplateHtmlTitle(props) @{
	<HtmlTitleBoundary id="template-html-title-boundary">
		<title data-opaque-boundary-html-title="true">
			{props.documentTitle as string}
		</title>
	</HtmlTitleBoundary>
}

// Regression shape: returned fragment normalization for the document title,
// followed by an opaque component whose children are forced to template form by
// a directive. The nested component then chooses SVG for its own title child.
export function ReturnedDirectiveTitles(props) {
	return <>
		<title data-directive-document-title="true">
			{props.documentTitle as string}
		</title>
		<Outer>
			@if (props.show) {
				<SvgTitleBoundary id="directive-svg-title-boundary">
					<title data-directive-svg-title="true">
						{props.svgTitle as string}
					</title>
				</SvgTitleBoundary>
			} @else {
				<span id="directive-title-hidden">Hidden</span>
			}
		</Outer>
	</>;
}
