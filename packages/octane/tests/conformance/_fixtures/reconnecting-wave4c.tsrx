// Function-component adaptations of the remaining public hydration cases in
// ReactDOMServerIntegrationReconnecting-test.js. Each fixture renders one
// observable server/client difference; the test owns adoption, recovery, and
// diagnostic assertions without depending on Octane's marker protocol.

export function AddedStyleValues(props) @{
	<div id="added-style-values" style={props.client ? { width: '1px' } : {}} />
}

export function NumberStringText(props) @{
	<div id="number-string-text">{props.value as string}</div>
}

export function DeepReorderedChildrenServer() @{
	<div id="deep-reordered" suppressHydrationWarning>
		<section>
			<div id="deep-first">first</div>
			<span id="deep-second">second</span>
		</section>
	</div>
}

export function DeepReorderedChildrenClient() @{
	<div id="deep-reordered" suppressHydrationWarning>
		<section>
			<span id="deep-second">second</span>
			<div id="deep-first">first</div>
		</section>
	</div>
}

function EmptyFunction() {
	return null;
}

export function EmptyFunctionRoot() @{
	<div id="empty-root">
		<EmptyFunction />
	</div>
}

export function EmptyTextRoot(props) @{
	<div id="empty-root">{props.text as string}</div>
}

export function ReorderedStyleValues(props) @{
	<div
		id="reordered-style-values"
		style={props.client ? { fontSize: '2px', width: '1px' } : { width: '1px', fontSize: '2px' }}
	/>
}

export function DifferentNumbers(props) @{
	<div id="different-numbers">{props.value as string}</div>
}

export function RawHtml(props) @{
	<div id="raw-html" dangerouslySetInnerHTML={{ __html: props.html }} />
}

export function SuppressedRawHtml(props) @{
	<div
		id="suppressed-raw-html"
		dangerouslySetInnerHTML={{ __html: props.html }}
		suppressHydrationWarning
	/>
}

export function AddedStyleAttribute(props) @{
	<div id="added-style-attribute" style={props.client ? { width: '1px' } : null} />
}

export function WhitespaceBetweenChildren(props) @{
	<div id="whitespace-children">
		<span id="whitespace-first">A</span>
		{props.gap as string}
		<span id="whitespace-second">B</span>
	</div>
}

export function DeepAttributeMismatch(props) @{
	<div id="deep-attribute" suppressHydrationWarning>
		<span id={props.client ? 'client-child' : 'server-child'}>child</span>
	</div>
}

export function SuppressedAdjacentText(props) @{
	<div id="suppressed-adjacent-text" suppressHydrationWarning>
		{props.first as string}
		{props.second as string}
	</div>
}

export function NumberStringStyle(props) @{
	<div id="number-string-style" style={props.style} />
}

export function DifferentChildType(props) @{
	<div id="different-child-type" suppressHydrationWarning>
		@if (props.client) {
			<span id="client-child-type">child</span>
		} @else {
			<div id="server-child-type">child</div>
		}
	</div>
}

export function NumberVsText(props) @{
	<div id="number-vs-text">{props.value as string}</div>
}

export function ReorderedChildrenServer() @{
	<div id="reordered-children">
		<div id="reordered-first">first</div>
		<span id="reordered-second">second</span>
	</div>
}

export function ReorderedChildrenClient() @{
	<div id="reordered-children">
		<span id="reordered-second">second</span>
		<div id="reordered-first">first</div>
	</div>
}

export function EmptyStyleAttribute(props) @{
	<div id="empty-style-attribute" style={props.client ? {} : { width: '1px' }} />
}

export function MissingStyleAttribute(props) @{
	<div id="missing-style-attribute" style={props.client ? null : { width: '1px' }} />
}

export function SuppressedAttribute(props) @{
	<div id="suppressed-attribute" title={props.value} suppressHydrationWarning />
}

export function MissingChildren(props) @{
	<div id="missing-children">
		@if (!props.client) {
			<span id="missing-child">child</span>
		}
	</div>
}

export function AdjacentTextMismatch(props) @{
	<div id="adjacent-text-mismatch">
		{props.first as string}
		{props.second as string}
	</div>
}

export function BareRoot() @{
	<div id="bare-function-root">same</div>
}

function FunctionLeaf() @{
	<div id="bare-function-root">same</div>
}

export function FunctionRoot() @{
	<FunctionLeaf />
}

export function SuppressedMoreChildren(props) @{
	<div id="suppressed-more-children" suppressHydrationWarning>
		<span id="more-first">first</span>
		@if (props.client) {
			<span id="more-second">second</span>
		}
	</div>
}

export function SuppressedReorderedChildrenServer() @{
	<div id="suppressed-reordered" suppressHydrationWarning>
		<div id="suppressed-first">first</div>
		<span id="suppressed-second">second</span>
	</div>
}

export function SuppressedReorderedChildrenClient() @{
	<div id="suppressed-reordered" suppressHydrationWarning>
		<span id="suppressed-second">second</span>
		<div id="suppressed-first">first</div>
	</div>
}

export function SuppressedStyle(props) @{
	<div id="suppressed-style" style={props.style} suppressHydrationWarning />
}

export function DomNodeRoot() @{
	<div id="empty-vs-node">
		<span id="server-dom-node">node</span>
	</div>
}

export function EmptyChildRoot() @{
	<div id="empty-vs-node">
		<EmptyFunction />
	</div>
}

export function SuppressedFewerChildren(props) @{
	<div id="suppressed-fewer-children" suppressHydrationWarning>
		<span id="fewer-first">first</span>
		@if (!props.client) {
			<span id="fewer-second">second</span>
		}
	</div>
}
