import { createElement, Suspense, use } from 'octane';

// Returns an SVG tree via createElement (VALUE position) so it renders through the
// runtime de-opt reconciler — exercising SVG-namespace creation outside the compiled
// template path.
export function SvgViaCreateElement() {
	return createElement(
		'svg',
		{ width: 10, height: 10, viewBox: '0 0 10 10', class: 'arrow' },
		createElement('path', { d: 'M0,0 H10', 'clip-path': 'url(#c)' }),
		createElement('clipPath', { id: 'c' }, createElement('rect', { width: 10, height: 10 })),
	);
}

function SvgAnchor(props) {
	return createElement(
		'a',
		{ id: props.id, 'data-label': props.label },
		createElement('text', { id: props.textId }, props.label),
	);
}

function MathRow(props) {
	return createElement(
		'mrow',
		{ id: props.id },
		createElement('mi', { id: props.textId }, props.label),
	);
}

function HtmlAnchor(props) {
	return createElement('a', { id: props.id, href: '#inside' }, props.label);
}

function CompiledSvgChildren(props) @{
	<svg id="compiled-svg-children">{props.children}</svg>
}

function CompiledMathChildren(props) @{
	<math id="compiled-math-children">{props.children}</math>
}

function TemplateSvgDestination(props) @{
	<svg id={props.id}>{props.children}</svg>
}

function TemplateMathDestination(props) @{
	<math id={props.id}>{props.children}</math>
}

function TemplateHtmlDestination(props) @{
	<section id={props.id}>{props.children}</section>
}

function TemplateForeignObjectDestination(props) @{
	<svg id={props.svgId}>
		<foreignObject id={props.id}>{props.children}</foreignObject>
	</svg>
}

// These component roots are intentionally ambiguous at definition time. The
// element namespace is selected by the host where each component is rendered.
function AmbiguousAnchorRoot(props) @{
	<a id={props.id}>{props.label as string}</a>
}

function AmbiguousSvgAnchorRoot(props) @{
	<a id={props.id}>
		<text id={props.textId}>{props.label as string}</text>
	</a>
}

function AmbiguousMathRowRoot(props) @{
	<mrow id={props.id}>
		<mi id={props.textId}>{props.label as string}</mi>
	</mrow>
}

function ReturnedAmbiguousAnchorRoot(props) {
	return <a id={props.id}>{props.label as string}</a>;
}

function ReturnedAmbiguousMathRowRoot(props) {
	return <mrow id={props.id}>{props.label as string}</mrow>;
}

// Template-form children cross an opaque component boundary before their
// destination is known. This covers multi-root child templates, ambiguous host
// roots owned by nested components, foreignObject's HTML reset, and explicit
// svg/math roots that remain fixed under an HTML destination.
export function TemplateNamespaceDestinations(props) @{
	<section id="template-namespace-destinations">
		<TemplateSvgDestination id="template-svg-destination">
			<a id="template-svg-anchor">
				<text id="template-svg-anchor-text">{props.label as string}</text>
			</a>
			<text id="template-svg-sibling">{props.label as string}</text>
			<AmbiguousAnchorRoot id="template-svg-component-anchor" label={props.label} />
			<ReturnedAmbiguousAnchorRoot
				id="template-svg-returned-component-anchor"
				label={props.label}
			/>
			<AmbiguousSvgAnchorRoot
				id="template-svg-component-tree"
				textId="template-svg-component-text"
				label={props.label}
			/>
		</TemplateSvgDestination>
		<TemplateMathDestination id="template-math-destination">
			<mrow id="template-math-row">
				<mi id="template-math-row-text">{props.label as string}</mi>
			</mrow>
			<mtext id="template-math-sibling">{props.label as string}</mtext>
			<AmbiguousMathRowRoot
				id="template-math-component-row"
				textId="template-math-component-text"
				label={props.label}
			/>
			<ReturnedAmbiguousMathRowRoot id="template-math-returned-component-row" label={props.label} />
		</TemplateMathDestination>
		<TemplateHtmlDestination id="template-html-destination">
			<a id="template-html-anchor">
				<span id="template-html-anchor-text">{props.label as string}</span>
			</a>
			<span id="template-html-sibling">{props.label as string}</span>
			<AmbiguousAnchorRoot id="template-html-component-anchor" label={props.label} />
			<ReturnedAmbiguousAnchorRoot
				id="template-html-returned-component-anchor"
				label={props.label}
			/>
		</TemplateHtmlDestination>
		<TemplateForeignObjectDestination svgId="template-foreign-svg" id="template-foreign-object">
			<a id="template-foreign-anchor">
				<span id="template-foreign-anchor-text">{props.label as string}</span>
			</a>
			<span id="template-foreign-sibling">{props.label as string}</span>
			<AmbiguousAnchorRoot id="template-foreign-component-anchor" label={props.label} />
			<ReturnedAmbiguousAnchorRoot
				id="template-foreign-returned-component-anchor"
				label={props.label}
			/>
		</TemplateForeignObjectDestination>
		<TemplateHtmlDestination id="template-fixed-svg-host">
			<svg id="template-fixed-svg">
				<a id="template-fixed-svg-anchor" />
			</svg>
		</TemplateHtmlDestination>
		<TemplateHtmlDestination id="template-fixed-math-host">
			<math id="template-fixed-math">
				<mrow id="template-fixed-math-row" />
			</math>
		</TemplateHtmlDestination>
	</section>
}

// Exercises every descriptor-bearing client path below an actual foreign-content
// parent: a lone pure host, keyed list items, a host with a component child, a
// template-position tag resolving to a string, a pure-to-Blocks upgrade, the
// foreignObject HTML reset, and MathML inheritance.
export function DeoptNamespaceSlots(props) @{
	const keyedLinks = props.items.map(
		(item) => createElement('a', { id: `svg-key-${item.id}`, key: item.id }, item.label),
	);
	const upgradingLink = createElement(
		'a',
		{ id: 'svg-upgrade' },
		props.enhanced
			? createElement(SvgAnchor, {
					id: 'svg-upgrade-child',
					textId: 'svg-upgrade-text',
					label: props.label,
				})
			: createElement('text', { id: 'svg-upgrade-text' }, props.label),
	);

	<section id="deopt-namespace-slots">
		<svg id="svg-slot" viewBox="0 0 100 100">
			{createElement('a', { id: 'svg-pure' }, props.label)}
			{keyedLinks}
			{createElement(
				'g',
				{ id: 'svg-component-host' },
				createElement(SvgAnchor, {
					id: 'svg-component-anchor',
					textId: 'svg-component-text',
					label: props.label,
				}),
			)}
			<props.parts.svgLink id="svg-string-tag">
				<text id="svg-string-text">{props.label as string}</text>
			</props.parts.svgLink>
			{upgradingLink}
			<foreignObject id="svg-foreign-object">{createElement(HtmlAnchor, {
				id: 'foreign-html-anchor',
				label: props.label,
			})}</foreignObject>
		</svg>
		<math id="math-slot">{createElement(
			'mrow',
			{ id: 'math-component-host' },
			createElement(MathRow, {
				id: 'math-component-row',
				textId: 'math-component-text',
				label: props.label,
			}),
		)}</math>
		{createElement(
			CompiledSvgChildren,
			null,
			createElement('a', { id: 'compiled-svg-ambiguous-child' }, props.label),
		)}
		{createElement(
			CompiledMathChildren,
			null,
			createElement('mrow', { id: 'compiled-math-child' }, props.label),
		)}
	</section>
}

function DescriptorElement(props) {
	return createElement(props.tag, { id: props.id }, props.label);
}

// Starts in ordinary HTML and enters SVG/MathML through host descriptors. The
// component descendants are deliberately opaque to the compiler; both runtimes
// must inherit the parser namespace selected by the descriptor parent.
export function DescriptorNamespaceDocument(props) {
	return createElement(
		'section',
		{ id: 'descriptor-namespace-document' },
		createElement(
			'svg',
			{ id: 'descriptor-svg' },
			createElement(DescriptorElement, {
				tag: 'a',
				id: 'descriptor-svg-anchor',
				label: props.label,
			}),
			createElement(
				'foreignObject',
				{ id: 'descriptor-foreign-object' },
				createElement(DescriptorElement, {
					tag: 'a',
					id: 'descriptor-html-anchor',
					label: props.label,
				}),
			),
		),
		createElement(
			'math',
			{ id: 'descriptor-math' },
			createElement(DescriptorElement, {
				tag: 'mrow',
				id: 'descriptor-math-row',
				label: props.label,
			}),
		),
	);
}

function AsyncDescriptorElement(props) {
	const id = use(props.promise);
	return createElement(props.tag, { id }, props.label);
}

function DescriptorSuspense(props) {
	return createElement(
		Suspense,
		{
			fallback: createElement(props.fallbackTag, { id: props.fallbackId }, 'loading'),
		},
		createElement(AsyncDescriptorElement, {
			promise: props.promise,
			tag: props.tag,
			label: props.label,
		}),
	);
}

// A streamed boundary records its active parser namespace when it suspends so
// the reveal segment can be parsed in SVG, MathML, or reset HTML context.
export function StreamedDescriptorNamespaces(props) {
	return createElement(
		'section',
		{ id: 'streamed-descriptor-namespaces' },
		createElement(
			'svg',
			{ id: 'streamed-descriptor-svg' },
			createElement(DescriptorSuspense, {
				promise: props.svgPromise,
				tag: 'a',
				label: 'svg ready',
				fallbackTag: 'text',
				fallbackId: 'streamed-svg-fallback',
			}),
		),
		createElement(
			'math',
			{ id: 'streamed-descriptor-math' },
			createElement(DescriptorSuspense, {
				promise: props.mathPromise,
				tag: 'mrow',
				label: 'math ready',
				fallbackTag: 'mtext',
				fallbackId: 'streamed-math-fallback',
			}),
		),
		createElement(
			'svg',
			{ id: 'streamed-foreign-svg' },
			createElement(
				'foreignObject',
				{ id: 'streamed-foreign-object' },
				createElement(DescriptorSuspense, {
					promise: props.htmlPromise,
					tag: 'a',
					label: 'html ready',
					fallbackTag: 'span',
					fallbackId: 'streamed-html-fallback',
				}),
			),
		),
	);
}
